const d = new Date();
d.setHours(0,0,0,0);
// Monday check
const day = d.getDay();
const diff = d.getDate() - day + (day === 0 ? -6 : 1);
d.setDate(diff);

console.log("Local Date Object:", d.toString());
console.log("toISOString split:", d.toISOString().split('T')[0]);

const year = d.getFullYear();
const month = String(d.getMonth() + 1).padStart(2, "0");
const date = String(d.getDate()).padStart(2, "0");
console.log("Local components:", `${year}-${month}-${date}`);
