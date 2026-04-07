const Database = require('better-sqlite3');
const db = new Database('.gsd/gsd.db', { readonly: true });
const m = db.prepare("SELECT * FROM milestones WHERE id = 'M002'").get();
if (m) {
  console.log("TITLE:", m.title);
  console.log("SUCCESS_CRITERIA:", m.success_criteria);
  console.log("DOD:", m.definition_of_done);
  console.log("KEY_RISKS:", m.key_risks);
  console.log("REQUIREMENT_COVERAGE:", m.requirement_coverage);
} else {
  console.log("NO M002 FOUND");
  const all = db.prepare("SELECT id, title FROM milestones").all();
  console.log("ALL:", JSON.stringify(all));
}
db.close();
