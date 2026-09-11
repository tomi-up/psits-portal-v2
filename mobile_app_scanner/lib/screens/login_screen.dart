import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/scanner_models.dart';
import '../services/scanner_api.dart';
import 'launch_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.api, required this.onSignedIn, super.key});

  final ScannerApi api;
  final Future<void> Function(ScannerLoginResult result) onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _eventCodeController = TextEditingController();
  final _pinController = TextEditingController();
  final _pinFocus = FocusNode();
  bool _busy = false;
  bool _hidePin = true;
  String? _error;

  @override
  void dispose() {
    _eventCodeController.dispose();
    _pinController.dispose();
    _pinFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final eventCode = _eventCodeController.text.trim();
    final pin = _pinController.text.trim();
    if (eventCode.isEmpty || pin.isEmpty) {
      setState(() => _error = 'Enter both the event code and your PIN.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final result = await widget.api.login(eventCode: eventCode, pin: pin);
      _pinController.clear();
      await widget.onSignedIn(result);
    } on ScannerApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset(
                          'assets/branding/psits_logo.png',
                          width: 76,
                          height: 76,
                          fit: BoxFit.contain,
                          semanticLabel: 'PSITS organization logo',
                        ),
                        const SizedBox(width: 18),
                        Container(
                          width: 1,
                          height: 54,
                          color: const Color(0xFF29405F),
                        ),
                        const SizedBox(width: 18),
                        Image.asset(
                          appLogoAsset,
                          width: 72,
                          height: 72,
                          fit: BoxFit.contain,
                          semanticLabel: 'PSITS Scanner logo',
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'PSITS Attendance Scanner',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Officer sign in',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                    const SizedBox(height: 32),
                    TextField(
                      controller: _eventCodeController,
                      autofocus: true,
                      textCapitalization: TextCapitalization.characters,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(
                        labelText: 'Event code',
                        prefixIcon: Icon(Icons.event_outlined),
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp('[A-Za-z0-9-]'),
                        ),
                        LengthLimitingTextInputFormatter(64),
                      ],
                      onSubmitted: (_) => _pinFocus.requestFocus(),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _pinController,
                      focusNode: _pinFocus,
                      obscureText: _hidePin,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Officer PIN',
                        prefixIcon: const Icon(Icons.key_outlined),
                        suffixIcon: IconButton(
                          tooltip: _hidePin ? 'Show PIN' : 'Hide PIN',
                          onPressed: () => setState(() => _hidePin = !_hidePin),
                          icon: Icon(
                            _hidePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(12),
                      ],
                      onSubmitted: (_) => _busy ? null : _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFF7F1D1D,
                          ).withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.error_outline,
                              size: 20,
                              color: Color(0xFFFCA5A5),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: Color(0xFFFCA5A5),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _busy ? null : _submit,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.login_rounded),
                      label: Text(_busy ? 'Signing in...' : 'Start scanning'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
