import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models/scanner_models.dart';
import '../services/scanner_api.dart';
import '../utils/qr_parser.dart';
import '../widgets/manual_student_id_dialog.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({
    required this.api,
    required this.token,
    required this.onSignOut,
    this.initialContext,
    super.key,
  });

  final ScannerApi api;
  final String token;
  final ScannerContext? initialContext;
  final Future<void> Function() onSignOut;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  late final MobileScannerController _cameraController;
  ScannerContext? _context;
  Timer? _pollTimer;
  Timer? _noticeTimer;
  bool _processing = false;
  bool _online = true;
  bool _torchOn = false;
  bool _manualEntryOpen = false;
  String? _lastRawValue;
  DateTime? _lastDetectedAt;
  _ScanNotice? _notice;
  final List<RecentScan> _recentScans = [];

  @override
  void initState() {
    super.initState();
    _context = widget.initialContext;
    _cameraController = MobileScannerController(
      facing: CameraFacing.back,
      formats: const [BarcodeFormat.qrCode],
      detectionSpeed: DetectionSpeed.normal,
      detectionTimeoutMs: 500,
      autoZoom: true,
    );
    _refreshContext();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _refreshContext(),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _noticeTimer?.cancel();
    _cameraController.dispose();
    super.dispose();
  }

  Future<void> _refreshContext() async {
    try {
      final context = await widget.api.getContext(widget.token);
      if (!mounted) return;
      setState(() {
        _context = context;
        _online = true;
      });
    } on ScannerApiException catch (error) {
      if (!mounted) return;
      if (error.isUnauthorized) {
        _showNotice(_NoticeKind.error, 'Scanner session expired.');
        await widget.onSignOut();
        return;
      }
      setState(() => _online = false);
    }
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing ||
        _manualEntryOpen ||
        _context?.currentCheckpoint == null) {
      return;
    }
    if (capture.barcodes.isEmpty) return;

    final rawValue = capture.barcodes.first.rawValue;
    if (rawValue == null) return;

    final now = DateTime.now();
    final isCoolingDown =
        rawValue == _lastRawValue &&
        _lastDetectedAt != null &&
        now.difference(_lastDetectedAt!) < const Duration(seconds: 3);
    if (isCoolingDown) return;

    _lastRawValue = rawValue;
    _lastDetectedAt = now;
    final studentId = extractStudentId(rawValue);
    if (studentId == null) {
      _showNotice(_NoticeKind.error, 'The QR code is empty.');
      return;
    }
    await _submitScan(studentId);
  }

  Future<void> _submitScan(String studentId) async {
    final checkpoint = _context?.currentCheckpoint;
    if (_processing || checkpoint == null) return;

    setState(() => _processing = true);
    await _pauseCamera();

    try {
      var result = await widget.api.scan(
        token: widget.token,
        studentId: studentId,
        checkpoint: checkpoint,
      );

      if (result.status == 'CROSS_SECTION_CONFIRM') {
        final confirmed = await _confirmCrossSection(result);
        if (!confirmed || !mounted) return;
        result = await widget.api.scan(
          token: widget.token,
          studentId: studentId,
          checkpoint: checkpoint,
          allowCrossSection: true,
        );
      }

      if (!mounted) return;
      if (result.status == 'ALREADY_SCANNED') {
        HapticFeedback.mediumImpact();
        _showNotice(
          _NoticeKind.duplicate,
          result.message ?? '${result.studentName} was already scanned.',
        );
      } else {
        HapticFeedback.heavyImpact();
        setState(() {
          _recentScans.insert(
            0,
            RecentScan(
              studentId: result.studentId,
              studentName: result.studentName,
              checkpoint: result.checkpoint,
              scannedAt: result.scannedAt?.toLocal() ?? DateTime.now(),
              crossSection: result.crossSection,
            ),
          );
          if (_recentScans.length > 10) _recentScans.removeLast();
        });
        _showNotice(
          _NoticeKind.success,
          '${result.studentName}${result.crossSection ? ' (cross-section)' : ''}',
        );
        await _refreshContext();
      }
    } on ScannerApiException catch (error) {
      if (!mounted) return;
      if (error.isUnauthorized) {
        _showNotice(_NoticeKind.error, 'Scanner session expired.');
        await widget.onSignOut();
      } else {
        HapticFeedback.vibrate();
        _showNotice(_NoticeKind.error, error.message);
      }
    } finally {
      if (mounted) setState(() => _processing = false);
      await _resumeCamera();
    }
  }

  Future<void> _pauseCamera() async {
    try {
      await _cameraController.stop();
    } on MobileScannerException {
      // A camera that has not started yet is already effectively paused.
    }
  }

  Future<void> _resumeCamera() async {
    if (!mounted || _context?.currentCheckpoint == null) return;
    try {
      await _cameraController.start();
    } on MobileScannerException {
      // The camera widget surfaces permission and initialization failures.
    }
  }

  Future<bool> _confirmCrossSection(ScanResult result) async {
    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: Color(0xFFFBBF24)),
                SizedBox(width: 10),
                Expanded(child: Text('Different section')),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.studentName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 16),
                _ComparisonRow(
                  label: 'Your assignment',
                  value: _context!.assignment.label,
                ),
                const SizedBox(height: 8),
                _ComparisonRow(
                  label: 'Student',
                  value: result.studentAssignment,
                  highlighted: true,
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFF59E0B),
                  foregroundColor: const Color(0xFF111827),
                ),
                child: const Text('Scan anyway'),
              ),
            ],
          ),
        ) ??
        false;
  }

  void _showNotice(_NoticeKind kind, String message) {
    _noticeTimer?.cancel();
    if (!mounted) return;
    setState(() => _notice = _ScanNotice(kind, message));
    _noticeTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _notice = null);
    });
  }

  Future<void> _openManualEntry() async {
    if (_manualEntryOpen) return;
    _manualEntryOpen = true;
    await _pauseCamera();

    try {
      if (!mounted) return;
      final studentId = await showDialog<String>(
        context: context,
        builder: (_) => const ManualStudentIdDialog(),
      );
      if (studentId != null && studentId.isNotEmpty) {
        await _submitScan(studentId);
      }
    } finally {
      _manualEntryOpen = false;
      await _resumeCamera();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scannerContext = _context;
    final checkpoint = scannerContext?.currentCheckpoint;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1B33),
        titleSpacing: 16,
        title: const Row(
          children: [
            Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF38BDF8)),
            SizedBox(width: 10),
            Text(
              'PSITS Scanner',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: widget.onSignOut,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: scannerContext == null
            ? _ConnectionPlaceholder(online: _online, onRetry: _refreshContext)
            : Column(
                children: [
                  _EventHeader(context: scannerContext, online: _online),
                  Expanded(
                    child: checkpoint == null
                        ? _WaitingPanel(onRefresh: _refreshContext)
                        : _ScannerWorkspace(
                            controller: _cameraController,
                            context: scannerContext,
                            processing: _processing,
                            torchOn: _torchOn,
                            notice: _notice,
                            recentScans: _recentScans,
                            onDetect: _onDetect,
                            onToggleTorch: () async {
                              await _cameraController.toggleTorch();
                              if (mounted) setState(() => _torchOn = !_torchOn);
                            },
                            onManualEntry: _openManualEntry,
                          ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _EventHeader extends StatelessWidget {
  const _EventHeader({required this.context, required this.online});

  final ScannerContext context;
  final bool online;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: const BoxDecoration(
        color: Color(0xFF0B1B33),
        border: Border(bottom: BorderSide(color: Color(0xFF203553))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  this.context.eventName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              _StatusPill(online: online),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoPill(
                icon: Icons.person_outline,
                text: this.context.officerName,
              ),
              _InfoPill(
                icon: Icons.groups_outlined,
                text: this.context.assignment.label,
              ),
              _InfoPill(
                icon: Icons.check_circle_outline,
                text: '${this.context.scanCount} scanned',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ScannerWorkspace extends StatelessWidget {
  const _ScannerWorkspace({
    required this.controller,
    required this.context,
    required this.processing,
    required this.torchOn,
    required this.notice,
    required this.recentScans,
    required this.onDetect,
    required this.onToggleTorch,
    required this.onManualEntry,
  });

  final MobileScannerController controller;
  final ScannerContext context;
  final bool processing;
  final bool torchOn;
  final _ScanNotice? notice;
  final List<RecentScan> recentScans;
  final void Function(BarcodeCapture) onDetect;
  final VoidCallback onToggleTorch;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    final checkpoint = this.context.currentCheckpoint!;
    final checkpointColor = _checkpointColor(checkpoint);

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        final camera = _CameraPanel(
          controller: controller,
          checkpoint: checkpoint,
          checkpointColor: checkpointColor,
          processing: processing,
          torchOn: torchOn,
          notice: notice,
          onDetect: onDetect,
          onToggleTorch: onToggleTorch,
          onManualEntry: onManualEntry,
        );
        final history = _RecentScans(scans: recentScans);

        if (wide) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(flex: 2, child: camera),
                const SizedBox(width: 16),
                SizedBox(width: 320, child: history),
              ],
            ),
          );
        }

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AspectRatio(aspectRatio: 3 / 4, child: camera),
            const SizedBox(height: 16),
            history,
          ],
        );
      },
    );
  }
}

class _CameraPanel extends StatelessWidget {
  const _CameraPanel({
    required this.controller,
    required this.checkpoint,
    required this.checkpointColor,
    required this.processing,
    required this.torchOn,
    required this.notice,
    required this.onDetect,
    required this.onToggleTorch,
    required this.onManualEntry,
  });

  final MobileScannerController controller;
  final String checkpoint;
  final Color checkpointColor;
  final bool processing;
  final bool torchOn;
  final _ScanNotice? notice;
  final void Function(BarcodeCapture) onDetect;
  final VoidCallback onToggleTorch;
  final VoidCallback onManualEntry;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: ColoredBox(
        color: Colors.black,
        child: Stack(
          fit: StackFit.expand,
          children: [
            MobileScanner(
              controller: controller,
              onDetect: onDetect,
              errorBuilder: (context, error) => _CameraError(error: error),
            ),
            Center(
              child: FractionallySizedBox(
                widthFactor: 0.72,
                heightFactor: 0.5,
                child: Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: checkpointColor, width: 3),
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 12,
              top: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xE610213B),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: checkpointColor),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: checkpointColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '$checkpoint checkpoint',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              right: 12,
              top: 12,
              child: IconButton.filledTonal(
                tooltip: torchOn ? 'Turn torch off' : 'Turn torch on',
                onPressed: onToggleTorch,
                icon: Icon(torchOn ? Icons.flash_on : Icons.flash_off),
              ),
            ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Row(
                children: [
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: processing ? null : onManualEntry,
                      icon: const Icon(Icons.keyboard_alt_outlined),
                      label: const Text('Enter student ID'),
                    ),
                  ),
                ],
              ),
            ),
            if (processing)
              const ColoredBox(
                color: Color(0x66000000),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (notice != null) _NoticeOverlay(notice: notice!),
          ],
        ),
      ),
    );
  }
}

class _RecentScans extends StatelessWidget {
  const _RecentScans({required this.scans});

  final List<RecentScan> scans;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Recent scans',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            if (scans.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Text(
                    'Scans from this session will appear here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF64748B)),
                  ),
                ),
              )
            else
              ...scans.map(
                (scan) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Icon(
                        scan.crossSection
                            ? Icons.warning_amber_rounded
                            : Icons.check_circle_rounded,
                        color: scan.crossSection
                            ? const Color(0xFFFBBF24)
                            : const Color(0xFF34D399),
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              scan.studentName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${scan.studentId} / ${scan.checkpoint}',
                              style: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        _formatTime(scan.scannedAt),
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _WaitingPanel extends StatelessWidget {
  const _WaitingPanel({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.pause_circle_outline,
                size: 52,
                color: Color(0xFF64748B),
              ),
              const SizedBox(height: 16),
              Text(
                'No checkpoint open',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              const Text(
                'Waiting for an admin to open IN, MIDDLE, or OUT.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF94A3B8)),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConnectionPlaceholder extends StatelessWidget {
  const _ConnectionPlaceholder({required this.online, required this.onRetry});

  final bool online;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              online ? Icons.sync_rounded : Icons.cloud_off_outlined,
              size: 48,
              color: const Color(0xFF64748B),
            ),
            const SizedBox(height: 16),
            Text(online ? 'Loading scanner...' : 'Server unavailable'),
            if (!online) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.no_photography_outlined,
                size: 44,
                color: Color(0xFFFCA5A5),
              ),
              const SizedBox(height: 12),
              const Text(
                'Camera unavailable',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              Text(
                error.errorDetails?.message ??
                    'Allow camera access in Android settings.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.online});

  final bool online;

  @override
  Widget build(BuildContext context) {
    final color = online ? const Color(0xFF34D399) : const Color(0xFFFBBF24);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
          size: 16,
          color: color,
        ),
        const SizedBox(width: 5),
        Text(
          online ? 'Online' : 'Offline',
          style: TextStyle(color: color, fontSize: 12),
        ),
      ],
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF172B48),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: const Color(0xFF94A3B8)),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}

class _ComparisonRow extends StatelessWidget {
  const _ComparisonRow({
    required this.label,
    required this.value,
    this.highlighted = false,
  });

  final String label;
  final String value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlighted ? const Color(0xFF78350F) : const Color(0xFF172B48),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
          const SizedBox(height: 3),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

enum _NoticeKind { success, duplicate, error }

class _ScanNotice {
  const _ScanNotice(this.kind, this.message);

  final _NoticeKind kind;
  final String message;
}

class _NoticeOverlay extends StatelessWidget {
  const _NoticeOverlay({required this.notice});

  final _ScanNotice notice;

  @override
  Widget build(BuildContext context) {
    final (color, icon, title) = switch (notice.kind) {
      _NoticeKind.success => (
        const Color(0xFF059669),
        Icons.check_circle_rounded,
        'Recorded',
      ),
      _NoticeKind.duplicate => (
        const Color(0xFFD97706),
        Icons.info_rounded,
        'Already scanned',
      ),
      _NoticeKind.error => (
        const Color(0xFFDC2626),
        Icons.error_rounded,
        'Not recorded',
      ),
    };

    return ColoredBox(
      color: color.withValues(alpha: 0.94),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 64, color: Colors.white),
              const SizedBox(height: 12),
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                notice.message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Color _checkpointColor(String checkpoint) {
  return switch (checkpoint) {
    'IN' => const Color(0xFF34D399),
    'MIDDLE' => const Color(0xFF38BDF8),
    'OUT' => const Color(0xFFA78BFA),
    _ => const Color(0xFFCBD5E1),
  };
}

String _formatTime(DateTime dateTime) {
  final hour = dateTime.hour == 0
      ? 12
      : (dateTime.hour > 12 ? dateTime.hour - 12 : dateTime.hour);
  final minute = dateTime.minute.toString().padLeft(2, '0');
  final suffix = dateTime.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $suffix';
}
