import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  SessionStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(migrateWithBackup: true),
          );

  static const String _tokenKey = 'scanner_session_token';
  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> writeToken(String token) {
    return _storage.write(key: _tokenKey, value: token);
  }

  Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
