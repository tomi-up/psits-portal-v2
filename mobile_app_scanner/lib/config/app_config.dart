import 'package:flutter/foundation.dart';

class AppConfig {
  AppConfig._();

  static const String _configuredApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.1.10:8000/api/v1',
  );

  static String get apiBaseUrl {
    final value = _configuredApiBaseUrl.replaceFirst(RegExp(r'/$'), '');
    final uri = Uri.tryParse(value);
    if (kReleaseMode && uri?.scheme != 'https') {
      throw StateError('Release builds require an HTTPS API_BASE_URL.');
    }
    return value;
  }

  static Uri apiUri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBaseUrl$normalizedPath');
  }
}
