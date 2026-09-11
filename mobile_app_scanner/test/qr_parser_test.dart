import 'package:flutter_test/flutter_test.dart';
import 'package:psits_scanner/utils/qr_parser.dart';

void main() {
  group('extractStudentId', () {
    test('accepts the portal plain-text QR format', () {
      expect(extractStudentId('22-09876'), '22-09876');
    });

    test('reads a student ID from JSON', () {
      expect(extractStudentId('{"student_id":"23-33445"}'), '23-33445');
    });

    test('reads a student ID from a URL', () {
      expect(
        extractStudentId('https://example.test/scan?student_id=24-77889'),
        '24-77889',
      );
    });

    test('rejects an empty QR payload', () {
      expect(extractStudentId('   '), isNull);
    });
  });
}
