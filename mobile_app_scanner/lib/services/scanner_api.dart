import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/scanner_models.dart';

class ScannerApiException implements Exception {
  const ScannerApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

class ScannerApi {
  ScannerApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  static const Duration _timeout = Duration(seconds: 15);

  Future<ScannerLoginResult> login({
    required String eventCode,
    required String pin,
  }) async {
    final json = await _request(
      method: 'POST',
      path: '/scanner/session',
      body: {'event_code': eventCode.trim().toUpperCase(), 'pin': pin.trim()},
    );
    return ScannerLoginResult.fromJson(json);
  }

  Future<ScannerContext> getContext(String token) async {
    final json = await _request(
      method: 'GET',
      path: '/scanner/session',
      token: token,
    );
    return ScannerContext.fromJson(json);
  }

  Future<ScanResult> scan({
    required String token,
    required String studentId,
    required String checkpoint,
    bool allowCrossSection = false,
  }) async {
    final json = await _request(
      method: 'POST',
      path: '/scanner/scan',
      token: token,
      body: {
        'student_id': studentId.trim(),
        'checkpoint': checkpoint,
        'allow_cross_section': allowCrossSection,
      },
    );
    return ScanResult.fromJson(json);
  }

  Future<void> logout(String token) async {
    await _request(method: 'POST', path: '/scanner/logout', token: token);
  }

  Future<Map<String, dynamic>> _request({
    required String method,
    required String path,
    String? token,
    Map<String, dynamic>? body,
  }) async {
    try {
      final headers = <String, String>{'Accept': 'application/json'};
      if (body != null) headers['Content-Type'] = 'application/json';
      if (token != null) headers['Authorization'] = 'Bearer $token';

      final request = http.Request(method, AppConfig.apiUri(path))
        ..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);

      final streamed = await _client.send(request).timeout(_timeout);
      final response = await http.Response.fromStream(streamed);
      final Map<String, dynamic> decoded;
      if (response.body.isEmpty) {
        decoded = <String, dynamic>{};
      } else {
        final Object? value;
        try {
          value = jsonDecode(response.body);
        } on FormatException {
          throw ScannerApiException(
            _nonJsonResponseMessage(response),
            statusCode: response.statusCode,
          );
        }
        if (value is! Map<String, dynamic>) {
          throw ScannerApiException(
            'The server returned an unexpected response '
            '(HTTP ${response.statusCode}).',
            statusCode: response.statusCode,
          );
        }
        decoded = value;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ScannerApiException(
          _errorMessage(decoded, response.statusCode),
          statusCode: response.statusCode,
        );
      }
      return decoded;
    } on ScannerApiException {
      rethrow;
    } on TimeoutException {
      throw const ScannerApiException('The server took too long to respond.');
    } on SocketException {
      throw const ScannerApiException(
        'Could not reach the server. Check this device\'s connection.',
      );
    } on FormatException {
      throw const ScannerApiException(
        'The server returned an invalid response.',
      );
    } on http.ClientException {
      throw const ScannerApiException('Could not reach the server.');
    }
  }

  String _errorMessage(Map<String, dynamic> json, int statusCode) {
    final detail = json['detail'];
    if (detail is String && detail.isNotEmpty) return detail;
    final message = json['message'];
    if (message is String && message.isNotEmpty) return message;
    return 'Request failed ($statusCode).';
  }

  String _nonJsonResponseMessage(http.Response response) {
    if (response.statusCode == 400 &&
        response.body.toLowerCase().contains('invalid host header')) {
      return 'The backend rejected ${AppConfig.apiUri('').host}. Add this '
          'address to TRUSTED_HOSTS and restart the backend.';
    }
    return 'The server returned a non-JSON response '
        '(HTTP ${response.statusCode}) from ${AppConfig.apiBaseUrl}.';
  }

  void close() => _client.close();
}
