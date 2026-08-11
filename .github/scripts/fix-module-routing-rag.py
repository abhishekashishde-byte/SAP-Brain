from pathlib import Path
p = Path('api/chat.js')
s = p.read_text()
old_pp = "{ module: 'PP', patterns: ['PP', 'PRODUCTION', 'CO01', 'CO02', 'CO03', 'MD01', 'MD04', 'PRODUCTION ORDER', 'PLANNED ORDER', 'BOM', 'ROUTING', 'WORK CENTER', 'MRP', 'PRODUCTION VERSION'] }"
new_pp = "{ module: 'PP', patterns: ['PP', 'PRODUCTION', 'CO01', 'CO02', 'CO03', 'MD01', 'MD04', 'PRODUCTION ORDER', 'PLANNED ORDER', 'BOM', 'ROUTING', 'WORK CENTER', 'MRP', 'MRP AREA', 'PRODUCTION VERSION'] }"
if old_pp not in s: raise SystemExit('PP module pattern block not found')
s = s.replace(old_pp, new_pp, 1)
old_pm = "{ module: 'PM', patterns: ['PM', 'PLANT MAINT', 'MAINTENANCE ORDER', 'IW31', 'IW32', 'IW33', 'IP10', 'IP11', 'EQUI', 'IFLOT', 'MPLA', 'STRATEGY GROUP', 'MAINTENANCE PLAN', 'FUNCTIONAL LOCATION', 'EQUIPMENT MASTER', 'MEASUREM', 'MEASUR', 'MEASUREMENT POINT', 'COUNTER READING', 'IMRG', 'IMRC', 'IMPT', 'IK01', 'IK11', 'IK21', 'PYEAR'] }"
new_pm = "{ module: 'PM', patterns: ['PM', 'PLANT MAINT', 'MAINTENANCE ORDER', 'REQUEST MAINTENANCE', 'REPORT MALFUNCTION', 'F1511', 'F1511A', 'F2023', 'IW31', 'IW32', 'IW33', 'IP10', 'IP11', 'EQUI', 'IFLOT', 'MPLA', 'STRATEGY GROUP', 'MAINTENANCE PLAN', 'FUNCTIONAL LOCATION', 'EQUIPMENT MASTER', 'MEASUREM', 'MEASUR', 'MEASUREMENT POINT', 'COUNTER READING', 'IMRG', 'IMRC', 'IMPT', 'IK01', 'IK11', 'IK21', 'PYEAR'] }"
if old_pm not in s: raise SystemExit('PM module pattern block not found')
s = s.replace(old_pm, new_pm, 1)
p.write_text(s)
