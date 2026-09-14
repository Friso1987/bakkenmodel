import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(process.argv[2])
for (const ws of wb.worksheets) {
  console.log(`=== ${ws.name}  (${ws.rowCount} rijen x ${ws.columnCount} kolommen)`)
  ws.eachRow((row, r) => {
    if (r > Number(process.argv[3] ?? 40)) return
    const cells = []
    row.eachCell((cell, c) => {
      let v = cell.value
      if (v && typeof v === 'object' && 'formula' in v) v = `=${v.formula} →${v.result}`
      cells.push(`${cell.address}:${String(v).slice(0, 60)}`)
    })
    if (cells.length) console.log(String(r).padStart(3), cells.join(' | '))
  })
}
