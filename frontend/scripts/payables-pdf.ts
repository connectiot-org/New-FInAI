// A valid, synthetic one-page supplier invoice with a >16KiB transport payload.
export function invoicePdf(): Buffer {
  let source = "%PDF-1.4\n";
  const offsets = [0];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content =
    "BT /F1 18 Tf 50 760 Td (Synthetic supplier invoice) Tj 0 -35 Td /F1 12 Tf (AP-PILOT-001 - GBP 1200.00) Tj ET";
  objects.push(
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  );
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  source += "% " + "transport-padding ".repeat(1200) + "\n";
  const xref = Buffer.byteLength(source);
  source +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}
