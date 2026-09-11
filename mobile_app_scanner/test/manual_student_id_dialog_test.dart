import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psits_scanner/widgets/manual_student_id_dialog.dart';

void main() {
  testWidgets('cancel closes a focused manual student ID dialog cleanly', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showDialog<String>(
              context: context,
              builder: (_) => const ManualStudentIdDialog(),
            ),
            child: const Text('Open'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '22-12345');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text('Enter student ID'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('submit returns a trimmed student ID', (tester) async {
    String? result;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showDialog<String>(
                context: context,
                builder: (_) => const ManualStudentIdDialog(),
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '22-12345');
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(result, '22-12345');
    expect(tester.takeException(), isNull);
  });
}
