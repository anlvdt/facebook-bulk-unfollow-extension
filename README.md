# Facebook Bulk Unfollow Extension

Chrome Extension (Manifest V3) hỗ trợ quản lý danh sách Facebook **Following** theo từng batch. Extension mở menu ba chấm của từng thẻ trong tab Following, chọn **Unfollow**, sau đó tải lại trang và tiếp tục sau 30 giây.

> Trạng thái: thử nghiệm. Facebook thường xuyên thay đổi DOM, nhãn truy cập (aria-label) và giới hạn thao tác; hãy kiểm tra kỹ trên một nhóm nhỏ trước khi chạy lâu dài.

## Tính năng

- Chrome Extension Manifest V3, không cần Tampermonkey.
- Popup **Start/Pause** và panel trạng thái chỉ trên trang Following (không che Messenger).
- Tối đa 25 mục mỗi batch.
- Refresh sau batch và đếm ngược cố định 30 giây trước batch kế tiếp.
- Lưu tổng số và trạng thái trong `chrome.storage.local` để tiếp tục sau refresh.
- Chỉ dùng các nút ba chấm trong khu vực bên dưới tab **Following**; loại trừ nút ba chấm ở header hồ sơ và thanh Friends.
- Hỗ trợ nhãn menu tiếng Anh và tiếng Việt: `Unfollow` / `Bỏ theo dõi`.

## Cài đặt extension

1. Tải hoặc clone repository này.
2. Mở `chrome://extensions` trong Google Chrome.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**.
5. Chọn thư mục [`chrome-extension`](./chrome-extension).
6. Mở trang `https://www.facebook.com/<ten-tai-khoan>/following`.
7. Nhấn biểu tượng extension và chọn **Start continuous run**.

Khi cập nhật mã nguồn, vào `chrome://extensions` và nhấn biểu tượng **Reload** của extension, sau đó refresh tab Facebook.

## Dừng hoặc khôi phục

- Nhấn **Pause** từ popup hoặc panel trên trang để dừng.
- Extension chỉ tự tiếp tục sau refresh do chính extension thực hiện, miễn trạng thái đang Active.
- Nếu Facebook thay đổi giao diện hoặc extension dừng với thông báo không tìm thấy menu Unfollow, dừng lại và kiểm tra thủ công trước khi thử tiếp.

## Cấu trúc

```text
chrome-extension/
  manifest.json       Chrome Extension Manifest V3
  popup.html          Giao diện popup
  popup.js            Điều khiển Start/Pause từ popup
  content.js          Luồng batch, selector menu và panel trang
  README.md            Hướng dẫn cài nhanh
Facebook-Bulk-Unfollow.userV2.js  Bản userscript Tampermonkey lịch sử
Facebook-Bulk-Unfollow.user.js    Bản userscript gốc lịch sử
NOTICE.md                         Nguồn gốc và ghi nhận tác giả
```

## Quyền riêng tư và an toàn

- Extension chỉ được cấp quyền trên `https://www.facebook.com/*`, cùng quyền `storage` để lưu trạng thái cục bộ và `tabs` để popup nhận biết tab Facebook đang mở.
- Không gửi dữ liệu đến máy chủ bên ngoài và không lưu mật khẩu Facebook.
- Bạn tự chịu trách nhiệm về việc dùng công cụ này trên tài khoản của mình và việc tuân thủ điều khoản của Facebook.
- Không để tab thao tác không giám sát nếu Facebook hiển thị cảnh báo, yêu cầu xác minh hoặc CAPTCHA.

## Nguồn gốc mã nguồn

Project này là bản dẫn xuất từ repository **Facebook-Bulk-Unfollow-Script** của Naqash Afzal:

- Upstream: <https://github.com/naqashafzal/Facebook-Bulk-Unfollow-Script>
- Snapshot nền tảng được clone từ commit [`8495d23f3e5262bbb0a8a2e45189ace85c400808`](https://github.com/naqashafzal/Facebook-Bulk-Unfollow-Script/commit/8495d23f3e5262bbb0a8a2e45189ace85c400808), tác giả Naqash Afzal.

Bản này giữ lại hai userscript lịch sử để tham khảo, đồng thời bổ sung `chrome-extension/`, Manifest V3, popup, trạng thái `chrome.storage.local`, vòng batch 30 giây và selector hạn chế phạm vi theo tab Following. Xem [NOTICE.md](./NOTICE.md) để biết chi tiết ghi nhận và lưu ý license.

## License

Upstream hiển thị huy hiệu MIT trong README, nhưng snapshot được dùng để tạo project này không có file `LICENSE` riêng. Repository này không tự cấp một license thay thế; hãy xác minh điều khoản hiện hành ở upstream và xin phép tác giả khi cần trước khi phân phối lại hoặc dùng ngoài mục đích cá nhân/thử nghiệm.

---

# English

## Overview

This is a Manifest V3 Chrome Extension for managing a Facebook **Following** list in batches. It opens the three-dot menu on each Following card, chooses **Unfollow**, reloads the page, then continues after a 30-second countdown.

> Status: experimental. Facebook regularly changes its DOM, accessible labels, and interaction limits. Test with a small batch before leaving it running for a long time.

## Features

- Manifest V3 Chrome Extension — no Tampermonkey required.
- A **Start/Pause** popup and an in-page status panel on the Following page only (never over Messenger).
- Up to 25 entries per batch.
- A page reload and a visible, fixed 30-second countdown between batches.
- Local progress storage using `chrome.storage.local`, so progress survives the extension's reloads.
- Targets three-dot menus below the selected **Following** tab only, excluding profile-header and Friends-toolbar menus.
- Recognizes English and Vietnamese menu text: `Unfollow` / `Bỏ theo dõi`.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the [`chrome-extension`](./chrome-extension) folder.
6. Open `https://www.facebook.com/<your-username>/following`.
7. Click the extension icon and choose **Start continuous run**.

After changing the source, press the extension's **Reload** icon on `chrome://extensions`, then reload the Facebook tab.

## Pause and recovery

- Use **Pause** in the popup or on-page panel to stop the workflow.
- The extension resumes only after a refresh initiated by the extension while its state is Active.
- If Facebook changes its UI or the extension reports that it cannot find an Unfollow action, pause the workflow and verify the page manually before retrying.

## Privacy and safety

- The extension has access only to `https://www.facebook.com/*`, plus `storage` for local state and `tabs` so the popup can identify the current Facebook tab.
- It does not send data to an external server and does not store Facebook passwords.
- You are responsible for using it only on your own account and for complying with Facebook's terms.
- Do not leave the workflow unattended if Facebook displays a warning, verification prompt, or CAPTCHA.

## Source attribution and license

This project is derived from [naqashafzal/Facebook-Bulk-Unfollow-Script](https://github.com/naqashafzal/Facebook-Bulk-Unfollow-Script), using commit [`8495d23f3e5262bbb0a8a2e45189ace85c400808`](https://github.com/naqashafzal/Facebook-Bulk-Unfollow-Script/commit/8495d23f3e5262bbb0a8a2e45189ace85c400808) by Naqash Afzal as the source snapshot. The Chrome extension, documentation, local storage flow, 30-second batching, and scoped Following selectors are later additions. See [NOTICE.md](./NOTICE.md) for the complete attribution record.

The upstream README displays an MIT badge, but the cloned source snapshot did not include a separate `LICENSE` file. This repository does not create or reinterpret a replacement license for upstream work. Verify the upstream project's current license and obtain any required authorization before redistribution or commercial use.
