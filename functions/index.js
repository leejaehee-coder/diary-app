// ===== START: Storage -> OCR -> Firestore =====
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const vision = require("@google-cloud/vision");

// ✅ region 고정 (2nd gen)
setGlobalOptions({ region: "us-central1" });

admin.initializeApp();
const db = admin.firestore();
const client = new vision.ImageAnnotatorClient();

/**
 * Trigger: Storage에 파일 업로드 완료
 * 경로 패턴: users/{uid}/shoppingReceipts/YYYY-MM-DD.(png|jpg|jpeg)
 * 동작:
 *  - 파일명에서 날짜 추출
 *  - Vision OCR 실행
 *  - users/{uid}/shoppingMeta/{YYYY-MM-DD} 문서에 OCR 결과 저장
 */
exports.ocrReceipt = onObjectFinalized(async (event) => {
  const object = event.data || {};
  const filePath = object.name || "";
  const bucket = object.bucket || "";

  // ✅ (추가) 이미지 파일만 처리 (안전)
  const contentType = object.contentType || "";
  if (!contentType.startsWith("image/")) {
    console.log("Skip (not an image):", { filePath, contentType });
    return;
  }

  // ✅ (수정) png만이 아니라 jpg/jpeg/png 다 허용
  const m = filePath.match(
    /^users\/([^/]+)\/shoppingReceipts\/(\d{4}-\d{2}-\d{2})\.(png|jpg|jpeg)$/i
  );
  if (!m) {
    console.log("Skip (not a receipt path):", filePath);
    return;
  }

  const uid = m[1];
  const dateStr = m[2]; // YYYY-MM-DD
  const imageUri = `gs://${bucket}/${filePath}`;

  const metaRef = db.doc(`users/${uid}/shoppingMeta/${dateStr}`);

  try {
    // 상태: processing
    await metaRef.set(
      {
        // ✅ 네 앱과도 맞춰서 저장해두면 디버깅이 편함
        imagePath: filePath, // (앱에서 쓰는 키)
        receiptPath: filePath, // (기존 키 유지)
        receiptUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        receiptOcrStatus: "processing",
      },
      { merge: true }
    );

    // OCR 실행
    const [result] = await client.textDetection(imageUri);
    const text = result.fullTextAnnotation?.text || "";

    // 금액/상호/날짜 간단 추출(휴리스틱)
    const moneyMatches =
      text.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})/g) || [];
    let total = 0;
    if (moneyMatches.length) {
      const nums = moneyMatches
        .map((s) => parseInt(String(s).replace(/,/g, ""), 10))
        .filter((n) => Number.isFinite(n));
      total = nums.length ? Math.max(...nums) : 0;
    }

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let store = lines[0] || "";
    const storeHint = lines.find((l) =>
      /(주식회사|점|마트|스토어|STORE|SHOP|MART)/i.test(l)
    );
    if (storeHint) store = storeHint;

    // 날짜: YYYY-MM-DD 또는 YYYY.MM.DD
    let ocrDate = dateStr;
    const d = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (d) {
      const mm = String(d[2]).padStart(2, "0");
      const dd = String(d[3]).padStart(2, "0");
      ocrDate = `${d[1]}-${mm}-${dd}`;
    }

    await metaRef.set(
      {
        receiptOcrStatus: "done",
        receiptOcrTotal: total || null,
        receiptOcrStore: store || null,
        receiptOcrDate: ocrDate || null,
        receiptOcrRawText: text || null,
        receiptUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("OCR done:", { uid, dateStr, total, store, ocrDate });
  } catch (err) {
    console.error("OCR failed:", err);

    await metaRef.set(
      {
        receiptOcrStatus: "failed",
        receiptOcrError: String(err?.message || err),
        receiptUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
});
// ===== END: Storage -> OCR -> Firestore =====