export const TOPICS = {
  "PP – Production Planning": [
    "Production Orders","Production Versions","Bill of Materials",
    "Routings & Work Centers","MRP & Planning","Demand Management",
    "Capacity Planning","Goods Issue / Confirmation",
  ],
  "PM – Plant Maintenance": [
    "Maintenance Orders","Maintenance Plans","Functional Locations",
    "Equipment Master","Notifications","Refurbishment Orders","Person Responsible",
  ],
  "MM – Materials Management": [
    "Purchase Orders","Goods Receipt","Stock Transfer","Subcontracting",
    "Inventory Management","Batch Management","MRP Areas",
  ],
  "Fiori / UX": [
    "Fiori Apps Overview","Launchpad Config","App Authorizations","Custom Tiles","Fiori vs GUI",
  ],
  "S/4HANA General": [
    "Table Lookups","BAdIs & User Exits","SPRO Configuration",
    "Error Messages","Z-Programs","Migration Topics",
  ],
}

export const MODULE_META = {
  "PP – Production Planning": { color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", label:"PP" },
  "PM – Plant Maintenance":   { color:"#4f46e5", bg:"#eef2ff", border:"#c7d2fe", label:"PM" },
  "MM – Materials Management":           { color:"#ea580c", bg:"#fff7ed", border:"#fed7aa", label:"MM" },
  "Fiori / UX":               { color:"#0284c7", bg:"#f0f9ff", border:"#bae6fd", label:"FI" },
  "S/4HANA General":          { color:"#B8960C", bg:"#fefce8", border:"#fde68a", label:"S4" },
}

export const STARTERS = {
  "Production Orders":    ["What statuses block a prod order?","How does TECO affect MRP?","Difference between PP01 and CO01?"],
  "Production Versions":  ["When is a prod version mandatory?","How does MRP select a prod version?","Can one material have multiple active versions?"],
  "Maintenance Orders":   ["PM02 vs PM01 order type?","How is settlement done for PM orders?","What triggers TECO in PM?"],
  "Maintenance Plans":    ["How does call horizon work?","Single vs strategy maintenance plan?","How to link measuring points?"],
  "Fiori Apps Overview":  ["Request maintenance vs report malfunction?","Best apps for production supervisor?","Which apps replace SAP GUI?"],
  "BAdIs & User Exits":   ["Difference between BAdI and user exit?","WORKORDER_UPDATE use cases?","How to find right BAdI for PM orders?"],
  "MRP & Planning":       ["Why is MRP not creating planned orders?","How does safety stock affect MRP?","Difference between VB and PD?"],
  "Error Messages":       ["How to find message class and number?","How to make error a warning?","Where to debug user exit for messages?"],
}

export const SUMMARISE_THRESHOLD = 16
