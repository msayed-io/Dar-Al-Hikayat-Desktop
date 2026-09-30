/**
 * تصدير الحكاية إلى PDF — مطابق حرفيًا لمنطق النسخة الإنتاجية:
 * قالب HTML فاخر RTL + طبقة تحميل + html2pdf بدقة A4 مضاعفة.
 */
import type { NoteStyles } from "../contexts/AppContext";

/** بناء محتوى الحكاية بتنسيق HTML قابل للطباعة (نفس قالب الإنتاج مع الحفاظ التام على التظليل) */
function buildStoryHtml(
  title: string,
  content: string,
  styles: NoteStyles,
  bg: string,
  text: string,
  secondary: string
): string {
  const align = styles.textAlign || "right";
  
  // Parse content using DOMParser to support rich spans and highlights
  const doc = new DOMParser().parseFromString(content, "text/html");
  let contentHtml = "";

  // تطبيع وتثبيت جميع عناصر التظليل (Spans, Marks, Classes, Inline Styles)
  const allElements = doc.querySelectorAll("span, mark, b, strong, em, i, u");
  allElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const isHighlight =
      el.classList.contains("highlight") ||
      el.classList.contains("hl") ||
      el.tagName === "MARK" ||
      Boolean(el.style.backgroundColor) ||
      Boolean(el.style.background) ||
      Boolean(el.getAttribute("style")?.includes("background"));

    if (isHighlight) {
      let bgCol = el.style.backgroundColor || el.style.background;
      if (!bgCol || bgCol === "transparent" || bgCol === "inherit") {
        const styleAttr = el.getAttribute("style") || "";
        const bgMatch = styleAttr.match(/background(?:-color)?:\s*([^;]+)/i);
        bgCol = bgMatch ? bgMatch[1].trim() : "#FFE600";
      }
      let txtCol = el.style.color;
      if (!txtCol || txtCol === "inherit") {
        txtCol = "#000000";
      }

      el.className = "highlight";
      el.style.setProperty("background-color", bgCol, "important");
      el.style.setProperty("color", txtCol, "important");
      el.style.setProperty("display", "inline-block", "important");
      el.style.setProperty("border-radius", "3px", "important");
      el.style.setProperty("padding", "1px 5px", "important");
      el.style.setProperty("margin", "0 1px", "important");
      el.style.setProperty("font-weight", "600", "important");
      el.style.setProperty("line-height", "1.4", "important");
      el.style.setProperty("box-decoration-break", "clone", "important");
      el.style.setProperty("-webkit-box-decoration-break", "clone", "important");
      el.style.setProperty("-webkit-print-color-adjust", "exact", "important");
      el.style.setProperty("print-color-adjust", "exact", "important");
    } else if (el.tagName === "SPAN") {
      // إزالة الوسوم المفرغة فقط دون لمس النصوص أو التنسيقات
      if (!el.getAttribute("style") && !el.className) {
        const textNode = doc.createTextNode(el.textContent || "");
        el.replaceWith(textNode);
      }
    }
  });

  // Check if we have rich HTML tags
  if (doc.querySelector("div") || doc.querySelector("p") || doc.querySelector("span") || doc.querySelector("mark") || doc.querySelector("br") || doc.querySelector("h2")) {
    const paragraphs: string[] = [];
    const children = Array.from(doc.body.childNodes);
    let currentParagraph = "";

    children.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        currentParagraph += child.textContent;
      } else if (child instanceof HTMLElement) {
        if (child.tagName === "BR") {
          paragraphs.push(currentParagraph);
          currentParagraph = "";
        } else if (child.tagName === "DIV" || child.tagName === "P") {
          if (currentParagraph) {
            paragraphs.push(currentParagraph);
            currentParagraph = "";
          }
          paragraphs.push(child.innerHTML);
        } else if (child.tagName === "H2" || child.tagName === "H1") {
          if (currentParagraph) {
            paragraphs.push(currentParagraph);
            currentParagraph = "";
          }
          paragraphs.push(child.outerHTML);
        } else {
          currentParagraph += child.outerHTML;
        }
      }
    });
    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }

    contentHtml = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        // إذا كان العنصر عنوان أو فاصل مزخرف، نعرضه كما هو دون وضعه في فقرة عادية
        if (trimmed.startsWith("<h2") || trimmed.startsWith("<h1") || trimmed.includes("❦")) {
          return trimmed;
        }
        return `<p style="font-family: 'Zain', sans-serif; font-weight: 400; font-size: ${styles.fontSize}px; color: ${styles.textColor || text}; line-height: 1.9; margin: 0 0 14px; text-align: ${align}; white-space: pre-wrap; word-break: break-word;">${trimmed}</p>`;
      })
      .filter(Boolean)
      .join("");
  } else {
    // Legacy plain text fallback
    contentHtml = content
      .split(/\n/)
      .map(
        (line) =>
          `<p style="font-family: 'Zain', sans-serif; font-weight: 400; font-size: ${styles.fontSize}px; color: ${styles.textColor || text}; line-height: 1.9; margin: 0 0 14px; text-align: ${align}; white-space: pre-wrap; word-break: break-word;">${escapeHtml(
            line || " "
          )}</p>`
      )
      .join("");
  }

  return `<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0;
    padding: 0;
    direction: rtl;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .highlight, .hl, mark {
    display: inline-block !important;
    border-radius: 3px !important;
    padding: 1px 5px !important;
    margin: 0 1px !important;
    font-weight: 600 !important;
    line-height: 1.4 !important;
    box-decoration-break: clone !important;
    -webkit-box-decoration-break: clone !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
</style>
</head>
<body>
<div style="background-color: ${bg}; padding: 30px 28px; direction: rtl; font-family: 'Zain', sans-serif;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #A7AA6360;">
    <p style="font-family: 'Zain', sans-serif; font-weight: 200; font-size: 11px; color: #A7AA63; margin-bottom: 4px;">دَارُ الحِكَايَاتِ</p>
    <h1 style="font-family: 'Zain', sans-serif; font-weight: 900; font-size: 24px; color: ${text}; margin: 6px 0; line-height: 1.4;">${escapeHtml(
    title
  )}</h1>
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin: 8px auto; max-width: 150px;">
      <div style="flex: 1; height: 1px; background: #A7AA63; opacity: 0.7;"></div>
      <span style="color: #A7AA63; font-size: 14px; opacity: 0.9;">❦</span>
      <div style="flex: 1; height: 1px; background: #A7AA63; opacity: 0.7;"></div>
    </div>
    <p style="font-family: 'Zain', sans-serif; font-weight: 400; font-size: 12px; color: ${secondary}; opacity: 0.9; margin-top: 3px;">بقلم: رحمه السيد موافي</p>
  </div>

  <!-- Content -->
  <div style="margin-top: 12px;">
    ${contentHtml}
  </div>

  <!-- Footer -->
  <div style="margin-top: 25px; padding-top: 10px; border-top: 1px solid #A7AA6340; text-align: center;">
    <p style="font-family: 'Zain', sans-serif; font-weight: 200; font-size: 9px; color: #A7AA63; opacity: 0.8;">
      صُنع بـ ❤ في دَارُ الحِكَايَاتِ
    </p>
  </div>

</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * تصدير إلى PDF — نفس آلية الإنتاج:
 * 1) طبقة تحميل داكنة "جاري تجهيز PDF..."
 * 2) رندر مخفي بعرض 794px + انتظار الخطوط
 * 3) html2pdf بجودة مضاعفة وإخراج Blob
 */
export async function exportStoryToPdf(
  title: string,
  content: string,
  styles: NoteStyles,
  themeColors: { bg: string; text: string; secondary: string }
): Promise<Blob> {
  const html = buildStoryHtml(
    title,
    content,
    styles,
    themeColors.bg,
    themeColors.text,
    themeColors.secondary
  );

  // طبقة التحميل
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.97);backdrop-filter:blur(12px);direction:rtl;";
  overlay.innerHTML =
    '<div style="text-align:center;"><div style="width:44px;height:44px;border:4px solid #A7AA6340;border-top-color:#A7AA63;border-radius:50%;animation:darSpin 0.8s linear infinite;margin:0 auto 20px;"></div><p style="font-family:Zain,sans-serif;color:#A7AA63;font-size:16px;font-weight:700;letter-spacing:1px;">جاري تجهيز PDF...</p></div><style>@keyframes darSpin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(overlay);

  // الحاوية المخفية للرندر
  const renderHost = document.createElement("div");
  renderHost.style.cssText =
    "position:fixed;top:0;left:0;width:794px;z-index:99998;background:#fff;opacity:1;pointer-events:none;";
  document.body.appendChild(renderHost);

  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const styleEl = document.createElement("style");
    styleEl.textContent = parsed.querySelector("style")?.textContent || "";
    renderHost.appendChild(styleEl);

    const contentEl = document.createElement("div");
    contentEl.innerHTML = parsed.body.innerHTML;
    renderHost.appendChild(contentEl);

    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 1500));

    const html2pdf = (await import("html2pdf.js")).default;

    return await html2pdf()
      .set({
        margin: 0,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: 794,
          windowWidth: 794,
        },
        jsPDF: {
          unit: "px",
          format: [794, 1123],
          orientation: "portrait",
          hotfixes: ["px_scaling"],
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(contentEl)
      .outputPdf("blob") as Promise<Blob>;
  } finally {
    document.body.removeChild(renderHost);
    document.body.removeChild(overlay);
  }
}


export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
