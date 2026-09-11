import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:psits_scanner/services/scanner_api.dart';

void main() {
  test('login uses the scanner session contract and parses context', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'token': 'scanner-token',
          'session_id': 'session-1',
          'expires_at': '2026-09-10T12:00:00Z',
          'context': {
            'event_id': 'event-1',
            'event_name': 'General Assembly',
            'event_code': 'ABC123',
            'officer_id': 'officer-1',
            'officer_name': 'Tomi',
            'assignment': {
              'id': 'assignment-1',
              'course': 'BSIT',
              'year_level': 2,
              'section': 'A',
            },
            'attendance_phase': 'IN',
            'current_checkpoint': 'IN',
            'scan_count': 4,
          },
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ScannerApi(client: client);

    final result = await api.login(eventCode: 'abc123', pin: '2468');

    expect(captured.method, 'POST');
    expect(captured.url.path, '/api/v1/scanner/session');
    expect(jsonDecode(captured.body), {'event_code': 'ABC123', 'pin': '2468'});
    expect(result.token, 'scanner-token');
    expect(result.context.currentCheckpoint, 'IN');
    expect(result.context.assignment.label, 'BSIT / Year 2 / A');
  });

  test(
    'scan sends the token, checkpoint, and cross-section confirmation',
    () async {
      late http.Request captured;
      final client = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'status': 'SCANNED',
            'checkpoint': 'MIDDLE',
            'student_id': '22-09876',
            'student_name': 'Juan Dela Cruz',
            'student_course': 'BSCS',
            'student_year_level': 4,
            'student_section': 'A',
            'cross_section': true,
            'scanned_at': '2026-09-10T12:00:00Z',
            'message': null,
          }),
          200,
        );
      });
      final api = ScannerApi(client: client);

      final result = await api.scan(
        token: 'scanner-token',
        studentId: '22-09876',
        checkpoint: 'MIDDLE',
        allowCrossSection: true,
      );

      expect(captured.headers['authorization'], 'Bearer scanner-token');
      expect(jsonDecode(captured.body), {
        'student_id': '22-09876',
        'checkpoint': 'MIDDLE',
        'allow_cross_section': true,
      });
      expect(result.status, 'SCANNED');
      expect(result.crossSection, isTrue);
    },
  );

  test('reports a trusted-host rejection instead of invalid JSON', () async {
    final client = MockClient(
      (_) async => http.Response('Invalid host header', 400),
    );
    final api = ScannerApi(client: client);

    await expectLater(
      api.login(eventCode: 'GA2026', pin: '123456'),
      throwsA(
        isA<ScannerApiException>()
            .having((error) => error.statusCode, 'statusCode', 400)
            .having(
              (error) => error.message,
              'message',
              contains('TRUSTED_HOSTS'),
            ),
      ),
    );
  });
}
