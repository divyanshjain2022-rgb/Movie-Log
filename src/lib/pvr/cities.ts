export interface PvrCity {
  name: string;
  lat: string;
  lng: string;
}

export const PVR_CITIES: PvrCity[] = [
  { name: "Lucknow", lat: "26.8467", lng: "80.9462" },
  { name: "Delhi-NCR", lat: "28.6139", lng: "77.209" },
  { name: "Mumbai", lat: "19.076", lng: "72.8777" },
  { name: "Bengaluru", lat: "12.9716", lng: "77.5946" },
  { name: "Hyderabad", lat: "17.385", lng: "78.4867" },
  { name: "Chennai", lat: "13.0827", lng: "80.2707" },
  { name: "Kolkata", lat: "22.5726", lng: "88.3639" },
  { name: "Pune", lat: "18.5204", lng: "73.8567" },
  { name: "Ahmedabad", lat: "23.0225", lng: "72.5714" },
  { name: "Jaipur", lat: "26.9124", lng: "75.7873" },
  { name: "Chandigarh", lat: "30.7333", lng: "76.7794" },
  { name: "Kochi", lat: "9.9312", lng: "76.2673" },
  { name: "Thiruvananthapuram", lat: "8.5241", lng: "76.9366" },
  { name: "Indore", lat: "22.7196", lng: "75.8577" },
  { name: "Bhopal", lat: "23.2599", lng: "77.4126" },
  { name: "Nagpur", lat: "21.1458", lng: "79.0882" },
  { name: "Vizag", lat: "17.6868", lng: "83.2185" },
  { name: "Coimbatore", lat: "11.0168", lng: "76.9558" },
  { name: "Surat", lat: "21.1702", lng: "72.8311" },
  { name: "Vadodara", lat: "22.3072", lng: "73.1812" },
  { name: "Nashik", lat: "19.9975", lng: "73.7898" },
  { name: "Aurangabad", lat: "19.8762", lng: "75.3433" },
  { name: "Mysore", lat: "12.2958", lng: "76.6394" },
  { name: "Mangalore", lat: "12.9141", lng: "74.856" },
  { name: "Bhubaneswar", lat: "20.2961", lng: "85.8245" },
  { name: "Patna", lat: "25.6093", lng: "85.1376" },
  { name: "Ranchi", lat: "23.3441", lng: "85.3096" },
  { name: "Guwahati", lat: "26.1445", lng: "91.7362" },
  { name: "Dehradun", lat: "30.3165", lng: "78.0322" },
  { name: "Ludhiana", lat: "30.901", lng: "75.8573" },
  { name: "Amritsar", lat: "31.634", lng: "74.8723" },
  { name: "Noida", lat: "28.5355", lng: "77.391" },
  { name: "Gurgaon", lat: "28.4595", lng: "77.0266" },
  { name: "Faridabad", lat: "28.4089", lng: "77.3178" },
  { name: "Ghaziabad", lat: "28.6692", lng: "77.4538" },
  { name: "Vijayawada", lat: "16.5062", lng: "80.648" },
  { name: "Raipur", lat: "21.2514", lng: "81.6296" },
  { name: "Kanpur", lat: "26.4499", lng: "80.3319" },
  { name: "Varanasi", lat: "25.3176", lng: "82.9739" },
  { name: "Agra", lat: "27.1767", lng: "78.0081" },
];

export function findPvrCity(city: string): PvrCity {
  const exact = PVR_CITIES.find(
    (item) => item.name.toLowerCase() === city.toLowerCase()
  );

  return exact || PVR_CITIES[0];
}

export function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}
