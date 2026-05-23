# Implementation Plan: Notification Logic Fix

## Overview

Sửa ba lỗi trong ứng dụng Expiry Tracker: (1) logic ngưỡng cảnh báo động dựa trên ngày sản xuất, (2) thêm trường `manufactureDate` vào form thêm/sửa sản phẩm, và (3) bật autofocus liên tục cho camera quét barcode.

## Tasks

- [x] 1. Sửa hàm `getExpiryStatus` trong `statusUtils.js`
  - [x] 1.1 Cập nhật signature hàm để nhận thêm tham số `manufactureDate`
    - Thêm tham số `manufactureDate` (mặc định `null`) vào `getExpiryStatus(expiryDate, warningDays, manufactureDate)`
    - Khi cả `manufactureDate` và `expiryDate` đều có giá trị: tính `totalDays = expiryDate - manufactureDate` (đơn vị ngày), sau đó `dynamicThreshold = Math.floor(totalDays / 3)`
    - Dùng `dynamicThreshold` thay cho `warningDays` để so sánh `daysLeft`
    - Khi không có `manufactureDate`: giữ nguyên logic cũ dùng `warningDays`
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.2 Viết property test cho logic ngưỡng cảnh báo động
    - **Property: Fix Checking – Dynamic Warning Threshold**
    - Với mọi sản phẩm có `manufactureDate` và `expiryDate`: nếu `daysLeft <= floor(totalDays/3)` thì `status` phải là `'warning'` (hoặc `'expired'`)
    - **Property: Preservation Checking**
    - Với mọi sản phẩm không có `manufactureDate`: kết quả `getExpiryStatus` mới phải bằng kết quả cũ
    - **Validates: Requirements 2.1, 2.2, 3.1**

  - [ ]* 1.3 Viết unit test cho các trường hợp biên của `getExpiryStatus`
    - Test: sản phẩm không có `expiryDate` → trả về `ok` / `'Không rõ'`
    - Test: `daysLeft < 0` → trả về `expired`
    - Test: `daysLeft === 0` → trả về `warning` / `'Hết hạn hôm nay'`
    - Test: có `manufactureDate`, `daysLeft` đúng bằng `floor(totalDays/3)` → `warning`
    - Test: có `manufactureDate`, `daysLeft > floor(totalDays/3)` → `ok`
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 2. Thêm trường `manufactureDate` vào form trong `ScannerPage.jsx`
  - [x] 2.1 Thêm trường `manufactureDate` vào state `form` và component `ProductForm`
    - Thêm `manufactureDate: ''` vào giá trị khởi tạo của `form` trong `ScannerPage`
    - Thêm `<Field label="Ngày sản xuất (NSX)">` với `<input type="date">` vào `ProductForm`, đặt sau trường "Thương hiệu" và trước "Hạn sử dụng"
    - Khi cả `manufactureDate` và `expiryDate` đều có giá trị: hiển thị dòng thông tin tham khảo "Ngưỡng cảnh báo tự động: ~X ngày" (= `floor(totalDays/3)`)
    - Khi không có `manufactureDate`: hiển thị trường nhập `notifyDate` (ngày thông báo thủ công) hoặc ghi chú dùng `warningDays` toàn cục
    - Khi có `manufactureDate`: ẩn trường nhập ngày thông báo thủ công
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.2 Viết unit test cho logic hiển thị/ẩn trường trong `ProductForm`
    - Test: khi `manufactureDate` rỗng → trường ngày thông báo thủ công hiển thị
    - Test: khi `manufactureDate` có giá trị → trường ngày thông báo thủ công ẩn, hiển thị thông tin ngưỡng tự động
    - _Requirements: 2.5, 2.6_

- [x] 3. Cập nhật `DetailPage.jsx` để hỗ trợ `manufactureDate`
  - [x] 3.1 Thêm hiển thị và chỉnh sửa trường `manufactureDate` trong `DetailPage`
    - Trong chế độ xem (view): thêm `<InfoRow>` hiển thị ngày sản xuất (nếu có), đặt trước hoặc sau dòng "Hạn sử dụng"
    - Trong chế độ chỉnh sửa (editing): thêm `<EditField label="Ngày sản xuất (NSX)">` với `<input type="date">`
    - Cập nhật lời gọi `getExpiryStatus` trong `DetailPage` để truyền thêm `product.manufactureDate`
    - Khi có `manufactureDate` và `expiryDate`: hiển thị thêm dòng "Ngưỡng cảnh báo: ~X ngày" trong phần thông tin
    - _Requirements: 2.3, 2.4, 3.10_

  - [ ]* 3.2 Viết unit test cho `DetailPage` với `manufactureDate`
    - Test: sản phẩm có `manufactureDate` → hiển thị đúng ngày sản xuất
    - Test: sản phẩm không có `manufactureDate` → không hiển thị dòng ngày sản xuất
    - _Requirements: 2.3, 3.10_

- [x] 4. Cập nhật `ProductContext.jsx` để lưu/đọc `manufactureDate`
  - [x] 4.1 Đảm bảo `manufactureDate` được truyền qua `addProduct` và `updateProduct`
    - Kiểm tra `addProduct`: trường `manufactureDate` từ `productData` phải được spread vào object sản phẩm mới (hiện tại đã dùng `...productData` nên chỉ cần xác nhận không bị lọc bỏ)
    - Kiểm tra `updateProduct`: tương tự, `updates` phải bao gồm `manufactureDate` khi người dùng chỉnh sửa
    - Kiểm tra `storageService`: đảm bảo `manufactureDate` được serialize/deserialize đúng từ localStorage
    - _Requirements: 3.8_

  - [ ]* 4.2 Viết unit test cho `addProduct` và `updateProduct` với `manufactureDate`
    - Test: `addProduct` với `manufactureDate` → sản phẩm được lưu có đúng `manufactureDate`
    - Test: `updateProduct` cập nhật `manufactureDate` → sản phẩm trong danh sách phản ánh giá trị mới
    - _Requirements: 3.8_

- [x] 5. Checkpoint – Đảm bảo tất cả tests pass
  - Đảm bảo tất cả tests pass, hỏi người dùng nếu có thắc mắc.

- [x] 6. Tối ưu autofocus liên tục trong `ScannerPage.jsx`
  - [x] 6.1 Thêm constraint `focusMode: 'continuous'` khi khởi tạo camera stream
    - Thay thế lời gọi `reader.decodeFromVideoDevice(back.deviceId, videoRef.current, callback)` bằng cách khởi tạo stream thủ công với `navigator.mediaDevices.getUserMedia`
    - Thêm constraint `advanced: [{ focusMode: 'continuous' }]` vào `video` constraints khi gọi `getUserMedia`
    - Bọc trong try/catch: nếu thiết bị không hỗ trợ `focusMode: 'continuous'` thì fallback về khởi tạo camera bình thường không có constraint đó
    - Sau khi có stream, gán `videoRef.current.srcObject = stream` và gọi `reader.decodeFromStream(stream, videoRef.current, callback)`
    - _Requirements: 2.7, 2.8, 3.7_

  - [ ]* 6.2 Viết unit test cho logic khởi tạo camera với autofocus
    - Test: khi `getUserMedia` với `focusMode: 'continuous'` thành công → stream được dùng, không fallback
    - Test: khi `getUserMedia` với `focusMode: 'continuous'` thất bại → fallback về `getUserMedia` không có constraint, không báo lỗi camera
    - _Requirements: 2.7, 3.7_

- [x] 7. Final Checkpoint – Đảm bảo tất cả tests pass
  - Đảm bảo tất cả tests pass, hỏi người dùng nếu có thắc mắc.

## Notes

- Tasks đánh dấu `*` là tùy chọn và có thể bỏ qua để ra MVP nhanh hơn
- Mỗi task tham chiếu đến requirements cụ thể để đảm bảo traceability
- `ProductContext.jsx` không cần thay đổi logic lớn vì đã dùng spread operator — chỉ cần xác nhận `manufactureDate` không bị lọc bỏ
- Khi sửa `getExpiryStatus`, cần cập nhật tất cả nơi gọi hàm này (`HomePage.jsx`, `DetailPage.jsx`, `ProductCard.jsx`) để truyền thêm `manufactureDate`
- Autofocus fix cần xử lý graceful degradation vì không phải thiết bị nào cũng hỗ trợ `focusMode: 'continuous'`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.1"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.2"] },
    { "id": 3, "tasks": ["2.2", "3.2", "6.1"] },
    { "id": 4, "tasks": ["6.2"] }
  ]
}
```
