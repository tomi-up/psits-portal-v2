import 'package:flutter/material.dart';

import 'models/scanner_models.dart';
import 'screens/launch_screen.dart';
import 'screens/login_screen.dart';
import 'screens/scanner_screen.dart';
import 'services/scanner_api.dart';
import 'services/session_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PsitsScannerApp());
}

class PsitsScannerApp extends StatefulWidget {
  const PsitsScannerApp({super.key});

  @override
  State<PsitsScannerApp> createState() => _PsitsScannerAppState();
}

class _PsitsScannerAppState extends State<PsitsScannerApp> {
  final ScannerApi _api = ScannerApi();
  final SessionStore _sessionStore = SessionStore();
  bool _showLaunchScreen = true;

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PSITS Scanner',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        fontFamily: 'Outfit',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0EA5E9),
          brightness: Brightness.dark,
          surface: const Color(0xFF10213B),
        ),
        scaffoldBackgroundColor: const Color(0xFF071426),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Color(0xFF10213B),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            borderSide: BorderSide(color: Color(0xFF29405F)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            borderSide: BorderSide(color: Color(0xFF29405F)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            borderSide: BorderSide(color: Color(0xFF38BDF8), width: 1.5),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(48, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        cardTheme: const CardThemeData(
          margin: EdgeInsets.zero,
          color: Color(0xFF10213B),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            side: BorderSide(color: Color(0xFF29405F)),
          ),
        ),
      ),
      home: Stack(
        children: [
          _ScannerGate(api: _api, sessionStore: _sessionStore),
          if (_showLaunchScreen)
            Positioned.fill(
              child: LaunchScreen(
                onFinished: () {
                  if (mounted) setState(() => _showLaunchScreen = false);
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _ScannerGate extends StatefulWidget {
  const _ScannerGate({required this.api, required this.sessionStore});

  final ScannerApi api;
  final SessionStore sessionStore;

  @override
  State<_ScannerGate> createState() => _ScannerGateState();
}

class _ScannerGateState extends State<_ScannerGate> {
  bool _loading = true;
  String? _token;
  ScannerContext? _initialContext;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final token = await widget.sessionStore.readToken();
    ScannerContext? context;

    if (token != null) {
      try {
        context = await widget.api.getContext(token);
        _token = token;
      } on ScannerApiException catch (error) {
        if (error.isUnauthorized) {
          await widget.sessionStore.clearToken();
        } else {
          _token = token;
        }
      }
    }

    if (!mounted) return;
    setState(() {
      _initialContext = context;
      _loading = false;
    });
  }

  Future<void> _signedIn(ScannerLoginResult result) async {
    await widget.sessionStore.writeToken(result.token);
    if (!mounted) return;
    setState(() {
      _token = result.token;
      _initialContext = result.context;
    });
  }

  Future<void> _signedOut() async {
    final token = _token;
    setState(() {
      _token = null;
      _initialContext = null;
    });
    await widget.sessionStore.clearToken();
    if (token != null) {
      try {
        await widget.api.logout(token);
      } on ScannerApiException {
        // The local credential is already removed, so sign-out is complete.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final token = _token;
    if (token == null) {
      return LoginScreen(api: widget.api, onSignedIn: _signedIn);
    }

    return ScannerScreen(
      api: widget.api,
      token: token,
      initialContext: _initialContext,
      onSignOut: _signedOut,
    );
  }
}
