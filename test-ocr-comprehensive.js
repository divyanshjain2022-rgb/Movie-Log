
const textBlueTicket = `
PVR INOX Limited
3rd Floor Phoenix Pallasio Mall, Amar Saheed Path,
Gomti Nagar Extension, Lucknow 226010
TAX INVOICE

ZOOTOPIA 2 (3D ENGLISH IMAX WITH
LUCKNOW PHOENIX PALASSIO (TicketId:TMAZJS3)

Admin ₹270.34
Service Charge ₹9.32
3D Charge ₹59.32
CGST @9% ₹30.51
SGST @9% ₹30.51

AMOUNT PAID ₹400.00

Guest Name : 
GSTN: ...
`;

const textAppScreenshot = `
Booking Details
Thank you for choosing PVR INOX!
Enjoy your show

ZOOTOPIA 2 (3D
ENGLISH IMAX WITH
ENGLISH SUBTITLE) (UA
7+)

Lucknow 226010TAX INVOICEZOOTOPIA 2

Fri, 28 Nov, 4:00 PM - 6:28 PM
SEATS INFO
SCREEN 4
A14

BOOKING ID:
TMAZJS3

Total                        ₹462.18
Net Price (1 x Ticket(s))      ₹338.98
GST                             ₹61.02
Total Ticket Price            ₹400.00
Action for 17 SDGs                2.00

Taxes & Fees
Convenience Fees                51.00
GST-09AAACP4526D1ZO              9.18
`;

console.log("--- Testing Blue Ticket ---");
testParsing(textBlueTicket);

console.log("\n--- Testing App Screenshot ---");
testParsing(textAppScreenshot);

function testParsing(text) {
    const fullText = text.toLowerCase();

    // 1. Ticket Cost
    const costPatterns = [
        /total\s*ticket\s*price\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
        /amount\s*paid\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i
    ];
    let cost = null;
    for (const p of costPatterns) {
        const m = text.match(p);
        if (m) { cost = m[1]; break; }
    }
    console.log("Cost:", cost);

    // 2. Convenience Fee
    const feePatterns = [
        /convenience\s*(?:fee|fees)\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
        // Removed Service Charge
    ];
    let fee = null;
    for (const p of feePatterns) {
        const m = text.match(p);
        if (m) { fee = m[1]; break; }
    }
    console.log("Fee:", fee);

    // 3. Movie Title
    const movieMatch = text.match(/([A-Z][A-Z0-9\s]+\d?)\s*\((?:3D|2D|IMAX|ENGLISH|HINDI|TELUGU|TAMIL)/);
    let title = null;
    if (movieMatch) {
        title = movieMatch[1].trim();
        title = title.replace(/^Lucknow\s*\d+\s*/i, "");
        title = title.replace(/^(?:TAX\s*INVOICE|INVOICE|TICKET)\s*/i, "").trim();
        title = title.replace(/\s*\(.*$/, "").trim();
    }
    console.log("Title:", title);

    // 4. Format
    const formatPatterns = [
        { regex: /3d\s*(?:english\s*)?imax/i, format: "IMAX 3D" },
        { regex: /imax\s*3d/i, format: "IMAX 3D" },
        { regex: /imax\s*2d/i, format: "IMAX 2D" },
        { regex: /imax/i, format: "IMAX" },
        { regex: /4dx/i, format: "4DX" },
        { regex: /\b3d\b/i, format: "3D" },
    ];
    let fmt = null;
    for (const item of formatPatterns) {
        if (item.regex.test(fullText)) { fmt = item.format; break; }
    }
    console.log("Format:", fmt);

    // 5. Theater
    const theaterPatterns = [
        /pvr\s*inox\s*(?:limited)?[^\n]*?([^\n]*(?:mall|cinema|phoenix|pallasio)[^\n]*)/i,
        /(?:floor|rd|nd|st)\s+([^\n]*(?:mall|phoenix|pallasio)[^\n]*)/i,
        /inox\s+(?:megaplex\s+)?([^\n,]+(?:mall|cinema)?[^\n,]*)/i,
        /pvr\s+([^\n,]+(?:mall|cinema)?[^\n,]*)/i,
        /(phoenix\s+pallass?io[^\n,]*)/i,
    ];
    let theater = null;
    for (const p of theaterPatterns) {
        const m = text.match(p);
        if (m) {
            theater = (m[1] || m[0]).trim().replace(/\s+/g, " ").replace(/^\d+\s*/, "").trim();
            if (theater.length > 5) break;
        }
    }
    if (!theater && fullText.includes("phoenix") && fullText.includes("pallasio")) {
        theater = "Phoenix Pallasio Mall, Lucknow";
    }
    console.log("Theater:", theater);

    // 6. Date
    const datePatterns = [
        /(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})?/i,
        /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})/i
    ];
    let date = null;
    for (const p of datePatterns) {
        const m = text.match(p);
        if (m) { date = m[0]; break; }
    }
    console.log("Date:", date);

    // 7. Time
    const timePatterns = [
        /(\d{1,2}:\d{2})\s*(am|pm)/i,
        /(\d{1,2}:\d{2})/
    ];
    let time = null;
    for (const p of timePatterns) {
        const m = text.match(p);
        if (m) { time = m[0]; break; }
    }
    console.log("Time:", time);

    // 8. Booking ID
    const bookingPatterns = [
        /(?:booking\s*(?:id|no)?|ticket\s*id)[:\s]*([A-Z0-9]+)/i,
        /\b([A-Z0-9]{6,10})\b/,
    ];
    let bookingId = null;
    for (const p of bookingPatterns) {
        const m = text.match(p);
        if (m && m[1].length > 4) {
            // Basic Check
            if (/\d/.test(m[1]) && /[A-Z]/.test(m[1])) {
                bookingId = m[1];
                break;
            }
        }
    }
    console.log("Booking ID:", bookingId);
}
