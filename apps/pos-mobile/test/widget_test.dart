import 'package:flutter_test/flutter_test.dart';
import 'package:pos_mobile/main.dart';

void main() {
  test('PosApkApp smoke check', () {
    const app = PosApkApp();
    expect(app, isNotNull);
  });
}
