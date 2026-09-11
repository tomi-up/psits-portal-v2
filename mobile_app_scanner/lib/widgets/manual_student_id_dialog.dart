import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class ManualStudentIdDialog extends StatefulWidget {
  const ManualStudentIdDialog({super.key});

  @override
  State<ManualStudentIdDialog> createState() => _ManualStudentIdDialogState();
}

class _ManualStudentIdDialogState extends State<ManualStudentIdDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    Navigator.pop(context, _controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter student ID'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        textCapitalization: TextCapitalization.characters,
        textInputAction: TextInputAction.done,
        decoration: const InputDecoration(hintText: '22-12345'),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9-]')),
          LengthLimitingTextInputFormatter(32),
        ],
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Submit')),
      ],
    );
  }
}
