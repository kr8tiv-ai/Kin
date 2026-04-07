const Database = require('better-sqlite3');
const db = new Database('.gsd/gsd.db');
const row = db.prepare("SELECT success_criteria, definition_of_done FROM milestones WHERE milestone_id = 'M002'").get();
if (row) {
  console.log('=== SUCCESS CRITERIA ===');
  console.log(row.success_criteria);
  console.log('=== DEFINITION OF DONE ===');
  console.log(row.definition_of_done);
} else {
  console.log('No M002 milestone found');
}
db.close();
