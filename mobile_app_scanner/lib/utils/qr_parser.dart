import 'dart:convert';

String? extractStudentId(String rawValue) {
  final raw = rawValue.trim();
  if (raw.isEmpty) return null;

  if (raw.startsWith('{')) {
    try {
      final json = jsonDecode(raw);
      if (json is Map<String, dynamic>) {
        final value = json['student_id'] ?? json['studentId'];
        if (value is String && value.trim().isNotEmpty) return value.trim();
      }
    } on FormatException {
      // Fall through to the plain-text format.
    }
  }

  final uri = Uri.tryParse(raw);
  final queryId =
      uri?.queryParameters['student_id'] ?? uri?.queryParameters['studentId'];
  if (queryId != null && queryId.trim().isNotEmpty) return queryId.trim();

  return raw;
}
