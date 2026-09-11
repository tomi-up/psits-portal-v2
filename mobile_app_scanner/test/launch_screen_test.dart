import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psits_scanner/screens/launch_screen.dart';

void main() {
  testWidgets('shows the logo and finishes its opening animation', (
    tester,
  ) async {
    var finished = false;

    await tester.pumpWidget(
      MaterialApp(home: LaunchScreen(onFinished: () => finished = true)),
    );

    expect(find.byType(Image), findsOneWidget);
    expect(find.text('PSITS Scanner'), findsOneWidget);
    expect(finished, isFalse);

    await tester.pumpAndSettle();

    expect(finished, isTrue);
  });
}
