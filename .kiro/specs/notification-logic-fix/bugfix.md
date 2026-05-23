# Bugfix Requirements Document

## Introduction

Tài liệu này mô tả các lỗi và cải tiến cần thực hiện cho ứng dụng **Expiry Tracker** (React + Vite), tập trung vào ba vấn đề chính:

1. **Logic ngưỡng cảnh báo sai**: Hàm `getExpiryStatus` trong `statusUtils.js` hiện dùng số ngày cố định (`warningDays`) để xác định trạng thái "sắp hết hạn". Đúng ra, khi sản phẩm có cả ngày sản xuất lẫn ngày hết hạn, ngưỡng cảnh báo phải được tính động bằng 1/3 tổng thời hạn sử dụng (từ ngày sản xuất đến ngày hết hạn).

2. **Thiếu trường ngày sản xuất**: Form thêm/chỉnh sửa sản phẩm không có trường nhập ngày sản xuất (`manufactureDate`). Khi có ngày sản xuất, ngưỡng cảnh báo phải được tính tự động; trường "ngày thông báo" thủ công chỉ hiển thị khi không có ngày sản xuất.

3. **Nhận diện barcode chậm**: Camera không có autofocus liên tục, làm giảm tốc độ và độ chính xác khi quét mã vạch.

---

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 – Logic ngưỡng cảnh báo cố định:**

1.1 WHEN sản phẩm có ngày sản xuất và ngày hết hạn với tổng thời hạn dài (ví dụ: 3 tháng) THEN hệ thống áp dụng ngưỡng cảnh báo cố định `warningDays` (mặc định 7 ngày) thay vì tính 1/3 tổng thời hạn (30 ngày)

1.2 WHEN `warningDays` được cấu hình trong Settings THEN hệ thống áp dụng cùng một giá trị cố định cho tất cả sản phẩm bất kể thời hạn sử dụng thực tế của từng sản phẩm

**Bug 2 – Thiếu trường ngày sản xuất:**

1.3 WHEN người dùng thêm sản phẩm mới qua form THEN hệ thống không cung cấp trường nhập ngày sản xuất (`manufactureDate`), khiến không thể tính ngưỡng cảnh báo động

1.4 WHEN sản phẩm không có ngày sản xuất THEN hệ thống không hiển thị trường nhập ngày thông báo thủ công, người dùng chỉ có thể dùng `warningDays` toàn cục

**Bug 3 – Camera không autofocus liên tục:**

1.5 WHEN camera đang quét barcode THEN hệ thống không kích hoạt autofocus liên tục, khiến ảnh bị mờ và tốc độ nhận diện chậm

1.6 WHEN thiết bị hỗ trợ `focusMode: 'continuous'` THEN hệ thống không yêu cầu constraint này khi khởi tạo camera stream

---

### Expected Behavior (Correct)

**Fix 1 – Logic ngưỡng cảnh báo động:**

2.1 WHEN sản phẩm có cả `manufactureDate` và `expiryDate` THEN hệ thống SHALL tính ngưỡng cảnh báo = `floor(totalDays / 3)` trong đó `totalDays = expiryDate - manufactureDate` tính bằng ngày

2.2 WHEN `warningDays` được cấu hình trong Settings THEN hệ thống SHALL chỉ áp dụng giá trị này cho các sản phẩm KHÔNG có ngày sản xuất

**Fix 2 – Thêm trường ngày sản xuất:**

2.3 WHEN người dùng mở form thêm/chỉnh sửa sản phẩm THEN hệ thống SHALL hiển thị trường nhập ngày sản xuất (`manufactureDate`)

2.4 WHEN người dùng nhập cả `manufactureDate` và `expiryDate` THEN hệ thống SHALL tự động tính và hiển thị ngưỡng cảnh báo dự kiến (= 1/3 tổng thời hạn) dưới dạng thông tin tham khảo

2.5 WHEN sản phẩm KHÔNG có `manufactureDate` THEN hệ thống SHALL hiển thị trường nhập ngày thông báo thủ công (`notifyDate` hoặc dùng `warningDays` toàn cục)

2.6 WHEN sản phẩm CÓ `manufactureDate` THEN hệ thống SHALL ẩn trường nhập ngày thông báo thủ công

**Fix 3 – Autofocus liên tục cho camera:**

2.7 WHEN khởi tạo camera stream để quét barcode THEN hệ thống SHALL yêu cầu constraint `focusMode: 'continuous'` nếu thiết bị hỗ trợ

2.8 WHEN camera đang hoạt động THEN hệ thống SHALL kích hoạt autofocus liên tục để tối ưu tốc độ nhận diện barcode

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN sản phẩm KHÔNG có `manufactureDate` và KHÔNG có `notifyDate` thủ công THEN hệ thống SHALL CONTINUE TO sử dụng `warningDays` toàn cục từ Settings để xác định trạng thái cảnh báo

3.2 WHEN sản phẩm đã hết hạn (ngày hiện tại > `expiryDate`) THEN hệ thống SHALL CONTINUE TO hiển thị trạng thái `expired` bất kể có hay không có `manufactureDate`

3.3 WHEN sản phẩm hết hạn đúng hôm nay (`daysLeft = 0`) THEN hệ thống SHALL CONTINUE TO hiển thị trạng thái `warning` với nhãn "Hết hạn hôm nay"

3.4 WHEN sản phẩm không có `expiryDate` THEN hệ thống SHALL CONTINUE TO trả về trạng thái `ok` với nhãn "Không rõ"

3.5 WHEN người dùng quét barcode thành công THEN hệ thống SHALL CONTINUE TO tra cứu thông tin sản phẩm và điền sẵn vào form

3.6 WHEN người dùng nhập barcode thủ công THEN hệ thống SHALL CONTINUE TO xử lý tra cứu như bình thường

3.7 WHEN thiết bị không hỗ trợ `focusMode: 'continuous'` THEN hệ thống SHALL CONTINUE TO khởi tạo camera bình thường mà không báo lỗi

3.8 WHEN người dùng lưu sản phẩm THEN hệ thống SHALL CONTINUE TO lưu toàn bộ dữ liệu sản phẩm vào localStorage và cập nhật danh sách

3.9 WHEN danh sách sản phẩm được hiển thị THEN hệ thống SHALL CONTINUE TO sắp xếp theo ngày hết hạn tăng dần

3.10 WHEN người dùng chỉnh sửa sản phẩm trong DetailPage THEN hệ thống SHALL CONTINUE TO cho phép cập nhật tất cả các trường hiện có

---

## Bug Condition Pseudocode

### Bug 1 & 2 – Ngưỡng cảnh báo

```pascal
FUNCTION isBugCondition_NotificationThreshold(product)
  INPUT: product với các trường { manufactureDate, expiryDate }
  OUTPUT: boolean

  RETURN product.manufactureDate IS NOT NULL
    AND product.expiryDate IS NOT NULL
END FUNCTION

// Property: Fix Checking – Dynamic Warning Threshold
FOR ALL product WHERE isBugCondition_NotificationThreshold(product) DO
  totalDays ← daysBetween(product.manufactureDate, product.expiryDate)
  dynamicThreshold ← floor(totalDays / 3)
  result ← getExpiryStatus'(product.expiryDate, product.manufactureDate)
  daysLeft ← daysBetween(today, product.expiryDate)
  ASSERT (daysLeft <= dynamicThreshold) IMPLIES (result.status = 'warning')
END FOR

// Property: Preservation Checking
FOR ALL product WHERE NOT isBugCondition_NotificationThreshold(product) DO
  ASSERT getExpiryStatus(product.expiryDate, warningDays)
       = getExpiryStatus'(product.expiryDate, warningDays)
END FOR
```

### Bug 3 – Autofocus

```pascal
FUNCTION isBugCondition_Autofocus(device)
  INPUT: device camera
  OUTPUT: boolean

  RETURN device.supportsContinuousFocus = true
END FUNCTION

// Property: Fix Checking – Continuous Autofocus
FOR ALL device WHERE isBugCondition_Autofocus(device) DO
  stream ← initCamera'(device)
  ASSERT stream.videoTrack.getConstraints().focusMode = 'continuous'
END FOR
```
