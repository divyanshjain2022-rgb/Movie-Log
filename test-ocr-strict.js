
const text = `
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

console.log("Testing OCR Regex (Strict Case)...");

// Remove 'i' flag from movie regex
const movieMatch = text.match(/([A-Z][A-Z0-9\s]+\d?)\s*\((?:3D|2D|IMAX|ENGLISH|HINDI|TELUGU|TAMIL)/); // No 'i'

let title = null;
if (movieMatch) {
    title = movieMatch[1].trim();
    title = title.replace(/^Lucknow\s*\d+\s*/i, "");
    title = title.replace(/^(?:TAX\s*INVOICE|INVOICE|TICKET)\s*/i, "");
    title = title.replace(/\s*\(.*$/, "").trim();
}
console.log("Movie Title Match:", title);
