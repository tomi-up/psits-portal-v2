class ScannerAssignment {
  const ScannerAssignment({
    required this.id,
    required this.course,
    required this.yearLevel,
    required this.section,
  });

  final String id;
  final String course;
  final int yearLevel;
  final String section;

  factory ScannerAssignment.fromJson(Map<String, dynamic> json) {
    return ScannerAssignment(
      id: json['id'] as String,
      course: json['course'] as String,
      yearLevel: json['year_level'] as int,
      section: json['section'] as String,
    );
  }

  String get label => '$course / Year $yearLevel / $section';
}

class ScannerContext {
  const ScannerContext({
    required this.eventId,
    required this.eventName,
    required this.eventCode,
    required this.officerId,
    required this.officerName,
    required this.assignment,
    required this.attendancePhase,
    required this.currentCheckpoint,
    required this.scanCount,
  });

  final String eventId;
  final String eventName;
  final String? eventCode;
  final String officerId;
  final String officerName;
  final ScannerAssignment assignment;
  final String attendancePhase;
  final String? currentCheckpoint;
  final int scanCount;

  factory ScannerContext.fromJson(Map<String, dynamic> json) {
    return ScannerContext(
      eventId: json['event_id'] as String,
      eventName: json['event_name'] as String,
      eventCode: json['event_code'] as String?,
      officerId: json['officer_id'] as String,
      officerName: json['officer_name'] as String,
      assignment: ScannerAssignment.fromJson(
        json['assignment'] as Map<String, dynamic>,
      ),
      attendancePhase: json['attendance_phase'] as String,
      currentCheckpoint: json['current_checkpoint'] as String?,
      scanCount: json['scan_count'] as int,
    );
  }
}

class ScannerLoginResult {
  const ScannerLoginResult({required this.token, required this.context});

  final String token;
  final ScannerContext context;

  factory ScannerLoginResult.fromJson(Map<String, dynamic> json) {
    return ScannerLoginResult(
      token: json['token'] as String,
      context: ScannerContext.fromJson(json['context'] as Map<String, dynamic>),
    );
  }
}

class ScanResult {
  const ScanResult({
    required this.status,
    required this.checkpoint,
    required this.studentId,
    required this.studentName,
    required this.studentCourse,
    required this.studentYearLevel,
    required this.studentSection,
    required this.crossSection,
    required this.scannedAt,
    required this.message,
  });

  final String status;
  final String checkpoint;
  final String studentId;
  final String studentName;
  final String? studentCourse;
  final int? studentYearLevel;
  final String? studentSection;
  final bool crossSection;
  final DateTime? scannedAt;
  final String? message;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    final scannedAt = json['scanned_at'] as String?;
    return ScanResult(
      status: json['status'] as String,
      checkpoint: json['checkpoint'] as String,
      studentId: json['student_id'] as String,
      studentName: json['student_name'] as String,
      studentCourse: json['student_course'] as String?,
      studentYearLevel: json['student_year_level'] as int?,
      studentSection: json['student_section'] as String?,
      crossSection: json['cross_section'] as bool,
      scannedAt: scannedAt == null ? null : DateTime.tryParse(scannedAt),
      message: json['message'] as String?,
    );
  }

  String get studentAssignment {
    return '${studentCourse ?? '?'} / Year ${studentYearLevel ?? '?'} / ${studentSection ?? '?'}';
  }
}

class RecentScan {
  const RecentScan({
    required this.studentId,
    required this.studentName,
    required this.checkpoint,
    required this.scannedAt,
    required this.crossSection,
  });

  final String studentId;
  final String studentName;
  final String checkpoint;
  final DateTime scannedAt;
  final bool crossSection;
}
