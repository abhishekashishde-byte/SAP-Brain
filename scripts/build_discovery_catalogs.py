#!/usr/bin/env python3
"""Builds the PP and MM discovery catalogs (draft) and adds scheduling/capacity + Fiori apps to PM.
Compact notation: fields 'Label' (core) or '~Label' (optional); questions (text, type[, options]); decisions (text, options).
Apps: (app_id or None, name, note). IDs were checked against SAP KBAs / SAP Learning / SAP blogs (Nov 2026)."""
import json, sys, copy
import os
D = os.path.join(os.path.dirname(__file__), '..', 'src', 'features', 'discovery', 'catalog') + '/'
YN = 'yesno'

def obj(prefix, oid, area, title, tcodes, plain, fields, questions, decisions, apps=()):
    o = {'id': oid, 'title': title, 'area': area, 'tcodes': tcodes, 'plain': plain, 'fields': [], 'questions': [], 'decisions': []}
    for i, f in enumerate(fields, 1):
        o['fields'].append({'id': f'{oid}.f{i}', 'label': f.lstrip('~'), 'tier': 'optional' if f.startswith('~') else 'core'})
    for i, q in enumerate(questions, 1):
        x = {'id': f'{oid}.q{i}', 'text': q[0], 'type': q[1]}
        if len(q) > 2: x['options'] = q[2]
        o['questions'].append(x)
    for i, d in enumerate(decisions, 1):
        o['decisions'].append({'id': f'{oid}.d{i}', 'text': d[0], 'options': d[1]})
    if apps: o['apps'] = [{'id': a[0], 'name': a[1], **({'note': a[2]} if len(a) > 2 and a[2] else {})} for a in apps]
    return o

# ---------------------------------------------------------------- PP
pp_areas = [
    {'id': 'pporg', 'title': 'Organisation & setup'},
    {'id': 'ppmaster', 'title': 'Production master data'},
    {'id': 'ppdemand', 'title': 'Demand & planning'},
    {'id': 'ppcap', 'title': 'Capacity planning & scheduling'},
    {'id': 'ppexec', 'title': 'Shop floor execution'},
    {'id': 'ppfin', 'title': 'Costs & controlling'},
    {'id': 'ppcross', 'title': 'Cross topics'},
]
pp = [
 obj('pp','ppo','pporg','Plant & planning organisation',['OX10','OPPQ','OPU3','OPJH'],'Plants, MRP controllers, production schedulers and supervisors — who plans and who runs production.',
   ['Plants / manufacturing sites','MRP controllers','Production schedulers','Production supervisors','Storage locations for production (supply areas)','~MRP areas','~Scheduling margin keys','~Area of responsibility for Fiori apps'],
   [('How many plants produce, and do they plan independently?','text'),('Who plans materials, and who schedules the shop floor?','text'),('Which manufacturing types are used?','multi',['Discrete (production orders)','Repetitive / flow','Process (batches, recipes)','Engineer-to-order / projects','Kanban']),('Is planning done centrally for several plants?',YN)],
   [('Production model per plant',['Discrete','Repetitive','Process','Mixed by product family'])]),
 obj('pp','ppmat','ppmaster','Material master — MRP & work scheduling views',['MM01','MM02','MM17','MD07'],'How each product is planned: MRP type, lot size, lead times, safety stock, procurement type.',
   ['MRP type','MRP controller','Lot-sizing procedure','Procurement type (in-house / external)','Special procurement key','In-house production time / planned delivery time','Safety stock / safety time','Strategy group','Production scheduling profile','Backflush indicator','~Batch management','~Minimum / maximum / rounding lot size','~Production storage location','~Coverage profile (range of coverage)'],
   [('How many materials are produced in-house vs. bought?','text'),('How are lot sizes decided today (fixed, per order, weekly)?','text'),('Are lead times kept up to date and who owns them?','text'),('Are there materials planned manually / outside the system?',YN)],
   [('Lot-sizing standard',['Exact lot size','Fixed lot size','Period lot size (weekly/monthly)','Optimising procedures']),('Safety buffer approach',['Safety stock','Safety time','Dynamic safety stock (coverage profile)','None'])],
   [('F1602','Manage Product Master Data','Fiori maintenance of the material (product) master incl. MRP and work scheduling data')]),
 obj('pp','ppbom','ppmaster','Bill of material',['CS01','CS02','CS03','CS11','CS12','CS20'],'What goes into each product: components, quantities, scrap, alternatives and validity.',
   ['BOM usage (production / engineering / costing)','Base quantity','Components & quantities','Item category (stock / non-stock / text)','Component scrap / operation scrap','Alternative BOMs','~Phantom assemblies','~Co-products / by-products','~Change numbers (engineering change management)','~Variant BOM / classification','~Issue storage location per component'],
   [('How many BOM levels does a typical product have?','number'),('Are engineering BOMs and production BOMs different today?',YN),('How are BOM changes controlled (change numbers, approvals)?','text'),('Are there configurable / variant products?',YN)],
   [('BOM change control',['Change numbers (ECM)','Direct change with history','Change records / workflow'])],
   [('F1813','Maintain Bill of Material','Create, change and display material BOMs in Fiori')]),
 obj('pp','ppwc','ppmaster','Work centre / resource',['CR01','CR02','CR03','CRC1','CR05'],'Where the work is done: machines, lines, crews — with capacity, shifts and costing link.',
   ['Work centre category','Standard value key (setup / machine / labour)','Formulas for duration and capacity','Capacity category & available capacity (shifts)','Factory calendar','Cost centre & activity types','~Backflush indicator at work centre','~Pooled capacities','~Hierarchy of work centres','~Queue and move times'],
   [('How many machines / lines / work centres are there?','number'),('Which standard values are tracked (setup, machine, labour)?','multi',['Setup time','Machine time','Labour time','Teardown','Other']),('How are shift patterns modelled today?','text'),('Is capacity measured in hours, units or both?','single',['Hours','Units','Both'])],
   [('Granularity of work centres',['One per machine','One per line / group','Mixed'])],
   [('F3289','Manage Work Center Capacity','Capacity situation and load per work centre')]),
 obj('pp','pprout','ppmaster','Routing / master recipe',['CA01','CA02','CA03','C201','CA85'],'The steps to make a product: operations, work centres, times, control keys and inspection points.',
   ['Routing type (routing / rate routing / reference operation set)','Operations & sequence','Work centre per operation','Control key (confirmation, costing, scheduling)','Standard values per operation','Component allocation to operations','~Parallel / alternative sequences','~Inspection characteristics (QM)','~Production resources / tools','~Milestone confirmation'],
   [('How detailed are routings today (per step / per line)?','single',['One step per product','Several steps','Detailed with times']),('Are the times in routings realistic and maintained?',YN),('Are external (subcontracted) operations used?',YN),('Do you use master recipes for process industry?',YN)],
   [('Routing detail level for the template',['Lean (few operations)','Standard','Detailed incl. sub-steps'])],
   [('F5425','Manage Routings','Fiori list and maintenance of routings')]),
 obj('pp','ppver','ppmaster','Production version',['C223','MM02'],'Combines one BOM alternative and one routing for a lot-size range and validity — mandatory in S/4HANA.',
   ['BOM alternative per version','Routing / recipe per version','Lot-size range','Validity dates','~Production line (repetitive)','~Lock indicator','~Distribution key'],
   [('Can a product be made in several ways (lines, plants, alternatives)?',YN),('Who will own production version maintenance?','text'),('Is mass creation from legacy data needed?',YN)],
   [('Version selection',['Manual / per order','Automatic by lot size','Quota arrangement'])],
   [('F2568','Manage Production Versions','Mass processing of production versions')]),
 obj('pp','ppdem','ppdemand','Demand management (PIRs & forecasts)',['MD61','MD62','MD63','MD04'],'Planned independent requirements, forecasts and how sales demand enters planning.',
   ['Requirement type','Planning strategy','Version of PIRs (active / inactive)','Planning horizon & buckets (days / weeks / months)','Consumption mode & periods','~Forecast model','~Upload of demand from Excel / external planning','~Customer independent requirements'],
   [('Where does the demand plan come from today (Excel, sales, IBP/APO)?','text'),('In which buckets is demand planned?','single',['Days','Weeks','Months']),('How do sales orders consume the forecast?','text'),('How often is the demand plan updated?','single',['Weekly','Monthly','Quarterly','Ad hoc'])],
   [('Source of demand plan',['Manual in SAP','Upload from Excel','SAP IBP / external tool','S&OP in SAP'])],
   [('F3445','Maintain PIRs','Create, change, mass maintain and upload PIRs')]),
 obj('pp','ppstr','ppdemand','Planning strategies (MTS / MTO / ATO)',['MD61','OPPS','VOV6'],'How products are triggered: make-to-stock, make-to-order, assemble-to-order, planning without final assembly.',
   ['Strategy group per material','Make-to-stock (10 / 40)','Make-to-order (20)','Planning without final assembly (50 / 52)','Assemble-to-order (82)','~Individual / collective requirements','~Requirements class & cost assignment'],
   [('Which products are made to stock and which to order?','text'),('Are sub-assemblies pre-produced before the customer order arrives?',YN),('Is the customer order a separate costing object today?',YN)],
   [('Main strategy',['10/40 Make-to-stock','20 Make-to-order','50/52 Planning without final assembly','82 Assemble-to-order','Mixed'])]),
 obj('pp','ppmrp','ppdemand','MRP run & material coverage',['MD01N','MD02','MD04','MD06','MD07','MD05'],'Material requirements planning with MRP Live: what to make or buy, when, and in what quantity.',
   ['Planning scope (plant / MRP area / product group)','Planning horizon','Scheduling (basic dates vs lead-time scheduling)','Planning file / net change','Exception messages & MRP elements','MRP controller worklist','~MRP areas (storage-location planning)','~Reorder-point / consumption-based planning','~Rescheduling horizon','~Multi-plant planning (stock transfer)'],
   [('How often is MRP run?','single',['Daily','Several times a day','Weekly','On demand']),('How do planners work through shortages and exceptions today?','text'),('Is any planning done in Excel outside the ERP?',YN),('Are external planning tools (APO, PP/DS, IBP) in use or planned?',YN)],
   [('MRP run frequency & scope',['Nightly full MRP Live','Net change several times a day','Per MRP controller on demand']),('Use of MRP areas',['Yes','No','Later phase'])],
   [('F1339','Schedule MRP Runs','Background MRP Live jobs (replaces MD01 job set-up)'),('F0247A','Monitor Material Coverage','Planner worklist of materials with shortages'),('F0251','Manage Material Coverage','Solve shortages; system proposes solutions'),('F3853','Detect MRP Situations','Finds MRP situations that need attention'),('F0270','Manage Internal Requirements','Shortages of components for production orders')]),
 obj('pp','ppplo','ppdemand','Planned orders & conversion',['MD11','MD12','MD13','CO40','CO41','MD16'],'Planned orders created by MRP and how they become production / process orders.',
   ['Planned order types','Firming of planned orders','Conversion to production order (single / collective)','Conversion horizon / opening period','~Planned order capacity check','~Partial conversion'],
   [('Who converts planned orders and how often?','text'),('Are planned orders firmed manually?',YN),('Is conversion automated in batch?',YN)],
   [('Order conversion',['Manual by planner','Collective conversion daily','Automatic job (opening period)'])],
   [('F4170','Manage Planned Orders','Planned orders list incl. conversion'),('F1718','Schedule Order Conversion Runs','Background conversion of planned orders')]),
 obj('pp','ppcp','ppcap','Capacity planning & scheduling',['CM01','CM07','CM21','CM25','CM50','OPU5'],'Load vs. capacity on work centres, lead-time scheduling, finite scheduling and capacity levelling.',
   ['Lead-time scheduling (forward / backward)','Scheduling parameters per order type','Capacity evaluation (load vs available)','Capacity levelling (planning table)','Finite / infinite scheduling','Shift / factory calendars','~Overall profiles for levelling','~Bottleneck (pacemaker) work centres','~Sequencing / setup optimisation','~PP/DS (advanced planning) in S/4HANA'],
   [('Is capacity checked before release today, or only time scheduled?','single',['Not checked','Checked manually','Checked in a tool']),('Which work centres are bottlenecks?','text'),('Do planners re-sequence orders on a board / Excel?',YN),('Is finite scheduling expected (no overload allowed)?',YN),('Is PP/DS (advanced planning) in scope?','single',['Yes','No','Unsure'])],
   [('Capacity planning approach',['Infinite (evaluate only)','Finite levelling in planning table','Capacity Scheduling Table (Fiori)','PP/DS']),('Scheduling direction',['Backward','Forward','Mixed by order type'])],
   [('F3289','Manage Work Center Capacity','Load, overload and capacity per work centre & period'),('F3770','Capacity Scheduling Table','Dispatch and re-sequence planned & production orders on work centres'),('F5460','Advanced Scheduling Board','Gantt scheduling with finite capacities — requires PP/DS')]),
 obj('pp','ppord','ppexec','Production order',['CO01','CO02','CO03','COOIS','CO05N','CO04N'],'The order to make a product: header, operations, components, release, status and papers.',
   ['Order type','Order header (quantity, dates, version)','Release (single / collective / automatic)','Material availability check at creation / release','Capacity check at release','Shop floor papers / labels','Status management (system & user status)','~Order change management','~Trigger points / workflow','~Serial numbers on order','~Hold / priority handling'],
   [('How many production orders per week?','number'),('Who releases orders and when?','text'),('Which papers go to the shop floor (job card, pick list, labels)?','text'),('Are orders changed after release often?',YN)],
   [('Order release',['Manual','Collective release daily','Automatic at creation'])],
   [('F2336','Manage Production Orders','Supervisor worklist: release, hold, issues'),('F2335','Manage Production Operations','Monitor and dispatch operations')]),
 obj('pp','ppav','ppexec','Material staging & availability',['CO24','LP10','PK13N','MB1A','MIGO'],'Getting components to the line: availability check, missing parts, staging, goods issue.',
   ['ATP checking rule / scope of check','Missing parts handling','Staging method (pick list, kanban, EWM staging)','Goods issue (manual / backflush)','Production supply areas','~Kanban control cycles','~Reservation handling'],
   [('How are components brought to the line today?','text'),('How are missing parts tracked?','text'),('Is a warehouse (EWM / WM) involved in staging?',YN),('Is kanban used?',YN)],
   [('Goods issue method',['Manual goods issue','Backflush','Mixed by component'])]),
 obj('pp','ppconf','ppexec','Confirmation & backflush',['CO11N','CO15','COGI','CO13','COHV'],'Reporting work done: quantities, scrap, times, activities — and automatic goods movements.',
   ['Confirmation level (operation / milestone / order)','Yield, scrap, rework','Activities / times confirmed','Automatic goods movements (backflush, auto GR)','Error handling for failed movements (COGI)','~Time tickets / HR integration','~Confirmation via terminals / MES','~Variance reasons'],
   [('Who confirms, and on which device (PC, terminal, paper)?','text'),('Are actual times recorded or only quantities?','single',['Only quantities','Quantities and times','Times per person']),('How is scrap recorded and reasoned?','text')],
   [('Confirmation level',['Each operation','Milestones','Final only'])],
   [('F3069','Confirm Production Operation','Operator confirmation of operations (no trigger points)'),('F2265','Production Order Confirmation','Object page, opened from Manage Production Orders / Operations')]),
 obj('pp','ppgr','ppexec','Goods receipt & order completion',['MIGO','MB31','CO02','KKS2','CO88'],'Receiving finished goods, technical completion, deletion flags and archiving.',
   ['Goods receipt for order (manual / automatic)','Under / over delivery tolerance','Technical completion & closure','~Batch creation at GR','~Labels / handling units at GR'],
   [('Is the finished-goods receipt posted manually or automatically?','single',['Manually','Automatically with final confirmation']),('Who closes orders and when?','text')],
   [('Order closing',['Manual','Periodic mass closing'])],
   [('F3110','Post Goods Receipt for Production Order','Fiori goods receipt for production orders')]),
 obj('pp','pprem','ppexec','Repetitive manufacturing',['MFBF','MF50','MF60','MFHU','MF47'],'Period-based flow production on lines without single orders: run schedules, backflush, cost collector.',
   ['REM profile','Production line / version','Run schedule quantities','Backflush & reporting points','Product cost collector','~Line loading / sequencing (MF50)'],
   [('Are there lines producing the same product continuously?',YN),('Is per-order tracking really needed for those products?',YN)],
   [('Use repetitive manufacturing',['Yes','No','Pilot line only'])]),
 obj('pp','pppi','ppexec','Process orders (PP-PI)',['COR1','COR2','COR6N','C201','CO53'],'Process industry: master recipes, phases, resources, batches and process instructions.',
   ['Master recipe & phases','Resources','Process instructions / control recipes','Batch determination','~Material quantity calculation','~Electronic batch record'],
   [('Is process (recipe-based) manufacturing in scope?',YN),('Are batches and shelf-life critical?',YN)],
   [('Order type for process industry',['Process order (PP-PI)','Production order','Not in scope'])]),
 obj('pp','ppcost','ppfin','Product costing & order settlement',['CK11N','CK40N','KKF6N','KKS2','KO88','CO88'],'Standard cost, cost of order, WIP, variances and settlement to stock / profitability.',
   ['Costing variant & valuation','Overhead (costing sheet)','Activity prices for work centres','WIP calculation','Variance calculation','Settlement profile','~Product cost by period vs by order','~Material ledger / actual costing'],
   [('Is a standard cost calculated per product today?',YN),('How often are standards updated?','single',['Yearly','Quarterly','Monthly']),('Is WIP valued at period end?',YN)],
   [('Controlling level',['Product cost by order','Product cost by period','Mixed'])]),
 obj('pp','ppbat','ppcross','Batch & serial number management',['MSC1N','MSC2N','IQ01','MB56','CL20N'],'Traceability: batches, characteristics, shelf life and serial numbers through production.',
   ['Batch level (plant / material / client)','Batch characteristics & classification','Shelf-life expiry','Batch determination','~Serial number profile','~Where-used / batch traceability'],
   [('Which products need batch or serial traceability?','text'),('Are there customer / regulatory traceability requirements?',YN)],
   [('Batch level',['Plant','Material','Client'])]),
 obj('pp','ppmes','ppcross','Shop floor integration (MES / DMC)',['POIT','CO11N','BD87'],'Connection to MES, SAP Digital Manufacturing, machines and terminals.',
   ['MES / DMC in use','Interfaces (orders out, confirmations in)','Machine data collection','~Label printing / scanners'],
   [('Is there an MES or machine data collection system?',YN),('Which data must flow back from the shop floor?','text')],
   [('Shop floor system',['SAP Digital Manufacturing','Third-party MES','SAP only (Fiori / terminals)'])]),
 obj('pp','ppkpi','ppcross','Reports & KPIs',['COOIS','MD07','CM01','MCP7'],'How production is measured: OEE, schedule adherence, scrap, lead time, inventory.',
   ['Schedule adherence','Scrap rate','Order lead time','Capacity utilisation','~OEE','~Planned vs actual cost'],
   [('Which production KPIs are reported today, and from where?','text'),('Who needs which report and how often?','text')],
   [('Reporting tool',['Embedded analytics / Fiori','BW / Datasphere','Excel'])]),
 obj('pp','ppusr','ppcross','Users, roles & training',['PFCG','SU01'],'Who uses which part of PP and how many users per role.',
   ['Planner users','Supervisor users','Operator / confirmation users','~Shared terminals'],
   [('How many users per role (planner, supervisor, operator)?','text'),('Will operators use Fiori, terminals or paper?','text')],
   [('Operator interface',['Fiori apps','Terminals / kiosks','MES','Paper + back-office entry'])]),
 obj('pp','pplgc','ppcross','Legacy data & migration',['LTMC','LTMOM'],'Which production data comes over from the legacy system and in what quality.',
   ['Materials (MRP views)','BOMs','Routings / recipes','Work centres','Production versions','Open production orders','~Demand / PIRs','~Historical consumption for forecast'],
   [('Which legacy system holds production data?','text'),('Are open orders migrated or finished in legacy?','single',['Migrate open orders','Finish in legacy','Mixed']),('How clean are BOMs and routings?','single',['Good','Partly','Poor'])],
   [('Open orders at go-live',['Migrate','Run down in legacy','Recreate manually'])]),
]

# ---------------------------------------------------------------- MM
mm_areas = [
    {'id': 'mmorg', 'title': 'Organisation & setup'},
    {'id': 'mmmaster', 'title': 'Purchasing master data'},
    {'id': 'mmproc', 'title': 'Procurement processes'},
    {'id': 'mminv', 'title': 'Inventory management'},
    {'id': 'mmiv', 'title': 'Invoice verification & valuation'},
    {'id': 'mmcross', 'title': 'Cross topics'},
]
mm = [
 obj('mm','mmo','mmorg','Purchasing & inventory organisation',['OX08','OX17','OME4','OX09'],'Purchasing organisations, purchasing groups, plants and storage locations.',
   ['Purchasing organisation(s)','Purchasing groups (buyers)','Plants','Storage locations','Company code assignment','~Reference purchasing organisation','~Central purchasing / central contracts'],
   [('Is purchasing central, per plant or per company?','single',['Central','Per plant','Per company','Mixed']),('How many buyers / purchasing groups?','number'),('How many storage locations per plant?','text')],
   [('Purchasing organisation model',['One central','One per company code','One per plant'])]),
 obj('mm','mmmat','mmmaster','Material master — purchasing & inventory views',['MM01','MM02','MM60','MMPV'],'Materials: types, units, purchasing data, valuation class and stock-keeping rules.',
   ['Material type','Base unit & order unit','Material group','Purchasing group','Valuation class & price control (S / V)','Batch / serial requirement','~Manufacturer part number','~Goods receipt processing time','~Non-stock materials (text items)'],
   [('How many active materials, and how many are bought?','text'),('Which material types are used today?','text'),('Are duplicates / obsolete materials a problem?',YN)],
   [('Price control for purchased materials',['Moving average (V)','Standard (S)','Mixed by material type'])],
   [('F1602','Manage Product Master Data')]),
 obj('mm','mmsup','mmmaster','Supplier (business partner)',['BP','XK99','MK05'],'Suppliers as business partners: roles, purchasing data, payment terms, partner functions.',
   ['BP roles (supplier, FI supplier)','Account groups / number ranges','Purchasing data (currency, incoterms, terms of payment)','Partner functions (ordering address, invoicing party)','~Supplier evaluation','~One-time suppliers','~Customer–supplier integration'],
   [('How many active suppliers?','number'),('Who creates suppliers and is there approval?','text'),('Is supplier data cleansed before migration?',YN)],
   [('Supplier creation process',['Central master data team','Purchasing','Workflow with approval'])],
   [('F1053A','Manage Supplier Master Data')]),
 obj('mm','mminf','mmmaster','Info records, conditions & source list',['ME11','ME12','ME01','MEQ1','ME13'],'Supplier-specific prices and lead times, allowed sources and quota arrangements.',
   ['Purchasing info records (price, delivery time)','Condition types (price, discount, freight)','Source list (fixed / blocked sources)','Quota arrangements','~Price scales','~Automatic source determination'],
   [('Where are supplier prices kept today?','text'),('Must a material always come from a fixed supplier?',YN),('Are several suppliers split by quota?',YN)],
   [('Source determination',['Info record','Source list mandatory','Contracts first','Manual'])],
   [('F0840A','Manage Sources of Supply','Info records, source list and contracts in one place')]),
 obj('mm','mmctr','mmmaster','Contracts & scheduling agreements',['ME31K','ME32K','ME31L','ME38','ME84'],'Long-term agreements: value / quantity contracts and scheduling agreements with delivery schedules.',
   ['Value / quantity contracts','Scheduling agreements (LP / LPA)','Delivery schedules & release documentation','Target value / quantity','~Central contracts','~JIT / forecast schedules'],
   [('Are framework agreements used, and for what?','text'),('Do suppliers deliver against schedules (e.g. automotive)?',YN),('Is EDI used for delivery schedules?',YN)],
   [('Repetitive supply',['Scheduling agreements','Contracts with release orders','Standard POs'])],
   [('F1600A','Manage Purchase Contracts'),('F2179','Manage Purchase Scheduling Agreements')]),
 obj('mm','mmpr','mmproc','Purchase requisition',['ME51N','ME52N','ME53N','ME55','ME5A'],'Internal request to buy: from MRP, from PM/PS orders or entered by employees.',
   ['Document types','Account assignment categories (cost centre, order, asset, WBS)','Source assignment','Release / approval','~Self-service requisitioning (catalogues)','~Free-text items'],
   [('Who raises requisitions (MRP, maintenance, employees)?','multi',['MRP','Maintenance / project orders','Employees (self-service)','Buyers']),('Do requisitions need approval?',YN),('Are catalogues / punch-out used?',YN)],
   [('Requisition approval',['Release strategy (classic)','Flexible workflow','No approval'])],
   [('F1639A','My Purchase Requisitions – New','Self-service; successor of Create Purchase Requisition (F1643)'),('F1048','Manage Purchase Requisitions'),('F2229','Manage Purchase Requisitions – Professional')]),
 obj('mm','mmrfq','mmproc','RFQ & quotations',['ME41','ME47','ME49'],'Asking suppliers for offers and comparing quotations.',
   ['RFQ document types','Quotation entry','Price comparison','~Ariba / external sourcing'],
   [('Are RFQs done in the system today?',YN),('Is an external sourcing tool used (Ariba, Coupa…)?',YN)],
   [('Sourcing tool',['SAP S/4HANA RFQ','SAP Ariba','Other / none'])],
   [('F1991','Manage Supplier Quotations')]),
 obj('mm','mmpo','mmproc','Purchase order',['ME21N','ME22N','ME23N','ME2M','ME9F','ME59N'],'The order to the supplier: items, prices, delivery dates, output and follow-up.',
   ['Document types','Item categories (standard, consignment, subcontracting, third party, service)','Account assignment','Delivery dates & confirmations','Output (print, e-mail, EDI)','Tolerances (price, quantity)','~Automatic PO creation (ME59N)','~Down payments','~Incoterms & freight'],
   [('How many POs per month?','number'),('How are POs sent to suppliers?','multi',['Print','E-mail','EDI','Ariba Network']),('Do suppliers confirm orders?',YN),('Are POs created automatically from requisitions?',YN)],
   [('PO output channel',['E-mail PDF','EDI / Ariba','Mixed'])],
   [('F0842A','Manage Purchase Orders','Fiori PO maintenance; unsupported features open in the Advanced app'),('F2358','Monitor Purchase Order Items','Open, overdue and to-be-invoiced items')]),
 obj('mm','mmrel','mmproc','Release strategy / approval',['CL20N','OMGS','ME28','ME29N'],'Who approves requisitions and orders and on which value limits.',
   ['Approval levels & value limits','Classic release strategy vs flexible workflow','Approvers / substitutes','~Approval by e-mail / mobile (My Inbox)'],
   [('What are the approval limits per level?','text'),('Who approves when someone is absent?','text')],
   [('Approval technology',['Flexible workflow','Classic release strategy'])]),
 obj('mm','mmsvc','mmproc','Service procurement',['ML81N','ME21N','MSE1'],'Buying services: lean services, service entry sheets, limits and acceptance.',
   ['Service items (lean services)','Service entry sheet & acceptance','Limits / unplanned services','~Service master','~External service management (classic)'],
   [('Which services are bought (maintenance, cleaning, consultants…)?','text'),('Who confirms the service was done?','text')],
   [('Service procurement model',['Lean services','Classic external services','Material-like items'])],
   [('F2027','Manage Service Entry Sheets – Lean Services')]),
 obj('mm','mmspc','mmproc','Subcontracting, consignment & stock transfers',['ME2O','MB1B','ME27','VL10B','MIGO'],'Special procurement: components to subcontractors, supplier-owned stock, plant-to-plant transfers.',
   ['Subcontracting (components provided)','Consignment stock & settlement','Stock transport orders (one / two step)','~Third-party / drop shipment','~Pipeline material'],
   [('Is material sent to subcontractors for processing?',YN),('Does any supplier keep consignment stock at your site?',YN),('Are goods moved between plants regularly?',YN)],
   [('Inter-plant transfers',['Stock transport orders','Simple transfer postings','Not needed'])]),
 obj('mm','mmgr','mminv','Goods receipt',['MIGO','MB51','MB52','VL31N'],'Receiving goods: against PO / inbound delivery, stock types, quality inspection, labels.',
   ['Goods receipt against PO','Inbound deliveries / ASN','Stock types (unrestricted, quality, blocked)','Over / under delivery tolerance','GR-based invoice verification','~Quality inspection at GR (QM)','~Labels / handling units','~Returns to supplier'],
   [('How are deliveries received and checked today?','text'),('Do suppliers send advance shipping notices?',YN),('Is incoming inspection done?',YN)],
   [('Receiving process',['GR against PO','Inbound delivery first','EWM-managed'])],
   [('F0843','Post Goods Receipt for Purchasing Document')]),
 obj('mm','mmgm','mminv','Goods issues & transfer postings',['MIGO','MB1A','MB1B','MMBE','MB52'],'Stock movements: issues to cost centre / order, transfers, scrapping and stock overview.',
   ['Goods issue to cost centre / order','Transfer posting storage location → storage location','Stock type changes','Scrapping','Movement types & reasons','~Reservations'],
   [('Which movements happen most (issue to order, transfer, scrapping)?','text'),('Is a warehouse system (EWM / WM) in use?','single',['EWM','WM (classic)','No warehouse system'])],
   [('Warehouse management',['IM only (storage locations)','EWM embedded','EWM decentral'])],
   [('F1061','Transfer Stock – In-Plant'),('F1062','Manage Stock','Initial entry and stock changes'),('F1595','Stock – Multiple Materials')]),
 obj('mm','mmpi','mminv','Physical inventory',['MI01','MI04','MI07','MI31','MI20'],'Counting stock: annual / cycle counting, differences and posting.',
   ['Inventory method (annual / cycle counting / continuous)','Count documents','Difference tolerances & approval','~Sampling (inventory sampling)','~Counting with scanners'],
   [('How is stock counted today?','single',['Annual count','Cycle counting','Both']),('Who approves inventory differences?','text')],
   [('Inventory method',['Annual','Cycle counting','Mixed'])],
   [('F5430','Manage Physical Inventory Count'),('F2913','Physical Inventory Analysis')]),
 obj('mm','mmplan','mminv','Consumption-based planning',['MD01N','MD04','MD07'],'Reorder-point and forecast-based planning for purchased and indirect materials.',
   ['MRP type (VB / VM / V1 / VV)','Reorder point & safety stock','Lot size','Planned delivery time','~Forecast parameters'],
   [('How is replenishment of purchased materials triggered today?','text'),('Are reorder points maintained in the system?',YN)],
   [('Replenishment method',['Reorder point','Forecast-based','MRP (demand-driven)','Manual'])],
   [('F0247A','Monitor Material Coverage'),('F1339','Schedule MRP Runs')]),
 obj('mm','mmivr','mmiv','Invoice verification',['MIRO','MIR7','MRBR','MRRL','MIR4'],'Checking supplier invoices against PO and GR: tolerances, blocks, ERS, scanning.',
   ['3-way match (PO / GR / invoice)','Tolerance keys','Payment blocks & release (MRBR)','Evaluated receipt settlement (ERS)','~Invoice scanning / OCR','~Credit memos & subsequent debits','~Unplanned delivery costs'],
   [('How do invoices arrive (paper, PDF, EDI)?','multi',['Paper','PDF e-mail','EDI / e-invoice','Supplier portal']),('Who resolves blocked invoices?','text'),('Is self-billing (ERS) used?',YN)],
   [('Invoice capture',['Manual MIRO','OCR / scanning solution','Fully electronic (e-invoicing)'])],
   [('F0859','Manage Supplier Invoices'),('F2452','Upload Supplier Invoices')]),
 obj('mm','mmval','mmiv','Valuation & account determination',['OMWB','OBYC','MR21','CKMLCP'],'How stock is valued and posted: valuation areas, price control, account determination, GR/IR.',
   ['Valuation area (plant)','Price control (S / V)','Automatic account determination (OBYC)','GR/IR clearing','~Material ledger / actual costing','~Split valuation'],
   [('Are materials valued at standard or moving average?','single',['Standard','Moving average','Both']),('Is GR/IR clearing reviewed every month?',YN)],
   [('Split valuation needed',['Yes','No'])],
   [('F3302','Reconcile GR/IR Accounts'),('F3303','Monitor GR/IR Account Reconciliation')]),
 obj('mm','mmout','mmcross','Output, forms & supplier collaboration',['NACE','OPD','SPRO'],'PO forms, e-mail / EDI output, supplier portal and Ariba Network.',
   ['Output management (BRF+ / NAST)','PO form layout','EDI messages (ORDERS, ORDRSP, DESADV, INVOIC)','~SAP Ariba Network / supplier portal'],
   [('Which documents go to suppliers, and how?','text'),('Is the PO form customised today?',YN)],
   [('Output framework',['S/4HANA output management','Classic NAST'])]),
 obj('mm','mmkpi','mmcross','Reports & KPIs',['ME2N','ME80FN','MB51','MC.9'],'Purchasing and inventory reporting: spend, delivery performance, stock value, slow movers.',
   ['Spend analysis','Supplier delivery performance','Stock value & range of coverage','Slow / non-moving stock','~Purchasing savings'],
   [('Which purchasing / inventory KPIs are reported today?','text'),('Who uses them and how often?','text')],
   [('Reporting tool',['Embedded analytics / Fiori','BW / Datasphere','Excel'])]),
 obj('mm','mmusr','mmcross','Users, roles & approvals',['PFCG','SU01'],'Who uses purchasing and inventory functions and how many users per role.',
   ['Buyers','Requesters','Warehouse / stores users','Invoice clerks','~Approvers only'],
   [('How many users per role?','text'),('Will requesters use self-service Fiori apps?',YN)],
   [('Requester channel',['Fiori self-service','Buyer enters on behalf','Catalogue / punch-out'])]),
 obj('mm','mmlgc','mmcross','Legacy data & migration',['LTMC','LTMOM'],'Which purchasing and stock data comes over from the legacy system.',
   ['Materials','Suppliers','Info records / prices','Contracts / scheduling agreements','Open POs','Stock balances (quantity & value)','~Open requisitions','~Purchasing history'],
   [('Which legacy system holds purchasing data?','text'),('Are open POs migrated or closed in legacy?','single',['Migrate','Close in legacy','Mixed']),('How is stock value reconciled at cut-over?','text')],
   [('Open POs at go-live',['Migrate','Close in legacy','Recreate manually'])]),
]

def check_ids(objs):
    seen = set()
    for o in objs:
        for k in [o['id']] + [x['id'] for x in o['fields'] + o['questions'] + o['decisions']]:
            assert k not in seen, k; seen.add(k)

check_ids(pp); check_ids(mm)
pp_cat = {'catalogId': 'sap-pp-discovery', 'version': '0.1.0', 'draft': True, 'domain': 'SAP PP', 'language': 'en', 'markStates': ['needed', 'not_needed', 'clarify'], 'areas': pp_areas, 'objects': pp}
mm_cat = {'catalogId': 'sap-mm-discovery', 'version': '0.1.0', 'draft': True, 'domain': 'SAP MM', 'language': 'en', 'markStates': ['needed', 'not_needed', 'clarify'], 'areas': mm_areas, 'objects': mm}

# ---------------------------------------------------------------- process catalogs
FREQ = ['daily', 'weekly', 'fortnightly', 'monthly', 'period_end', 'yearly', 'on_demand', 'event_driven']
def proc(cid, version, cats, items):
    out = []
    for pid, cat, title, plain, hint, rel, qs in items:
        out.append({'id': pid, 'category': cat, 'title': title, 'plain': plain, 'sapHint': hint, 'relatedObjects': rel,
                    'questions': [{'id': f'{pid}.q{i}', 'text': t, 'type': 'text'} for i, t in enumerate(qs, 1)]})
    return {'catalogId': cid, 'version': version, 'language': 'en', 'statuses': ['valid', 'not_valid', 'later', 'clarify'], 'frequencies': FREQ, 'categories': cats, 'processes': out}

pp_proc = proc('sap-pp-process-catalog', '0.1.0',
 [{'id': 'jobs', 'title': 'Background jobs & periodic runs', 'kind': 'job'}, {'id': 'flow', 'title': 'Production process variants', 'kind': 'process'}],
 [('ppj.1','jobs','MRP Live run','Nightly / regular planning run.','MD01N via Schedule MRP Runs (F1339)','ppmrp',['Scope and timing of the run?','Who reviews exceptions afterwards?']),
  ('ppj.2','jobs','Planned order conversion','Converting planned orders into production orders in batch.','CO41 / Schedule Order Conversion Runs (F1718)','ppplo',['Opening period / horizon?']),
  ('ppj.3','jobs','Collective release of orders','Releasing orders due in the release horizon.','COHV mass processing','ppord',['Release horizon in days?']),
  ('ppj.4','jobs','Reprocess failed goods movements','Clearing COGI errors from backflush.','COGI / CO1P','ppconf',['Who owns the error list?']),
  ('ppj.5','jobs','Capacity requirements update','Re-scheduling orders and updating capacity load.','CM25 / CM40 levelling or Capacity Scheduling Table','ppcp',['Is levelling run automatically?']),
  ('ppj.6','jobs','Period-end WIP, variances & settlement','Month-end order controlling steps.','KKAO / KKS2 / CO88','ppcost',['Which steps are run and by whom?']),
  ('ppj.7','jobs','Technical completion / closing of orders','Mass closing of finished orders.','COHV','ppgr',['Criteria for closing?']),
  ('ppf.1','flow','Make-to-stock with forecast','Producing against forecast / PIRs.','Strategy 10/40','ppstr',['Which product families?']),
  ('ppf.2','flow','Make-to-order','Producing for a specific sales order.','Strategy 20','ppstr',['Is the sales order a costing object?']),
  ('ppf.3','flow','Rework','Reworking defective parts.','Rework order / rework operation','ppord',['How is rework recorded and costed?']),
  ('ppf.4','flow','External processing (subcontracted operation)','Single operations done by a supplier.','Control key PP02 + purchase requisition','pprout',['Which operations go outside?']),
  ('ppf.5','flow','Co-products / by-products','Several outputs from one order.','Co-product BOM items','ppbom',['Which products and how are costs split?']),
 ])
mm_proc = proc('sap-mm-process-catalog', '0.1.0',
 [{'id': 'jobs', 'title': 'Background jobs & periodic runs', 'kind': 'job'}, {'id': 'flow', 'title': 'Procurement & inventory variants', 'kind': 'process'}],
 [('mmj.1','jobs','Automatic PO creation','Converting assigned requisitions into POs.','ME59N','mmpo',['Which requisitions are automatic?']),
  ('mmj.2','jobs','PO output / EDI sending','Sending POs to suppliers.','Output management job','mmout',['E-mail, EDI or Ariba?']),
  ('mmj.3','jobs','Evaluated receipt settlement','Self-billing from goods receipts.','MRRL','mmivr',['Which suppliers?']),
  ('mmj.4','jobs','Release blocked invoices','Automatic release when the block reason is gone.','MRBR','mmivr',['Frequency?']),
  ('mmj.5','jobs','GR/IR clearing & reconciliation','Month-end GR/IR analysis.','F.13 / Reconcile GR/IR Accounts (F3302)','mmval',['Who owns it?']),
  ('mmj.6','jobs','Consumption-based planning run','Reorder-point / forecast planning.','MD01N','mmplan',['Which materials?']),
  ('mmj.7','jobs','Period closing (MMPV)','Opening the next posting period for materials.','MMPV','mmval',['Who runs it and when?']),
  ('mmf.1','flow','Stock material procurement','Requisition → PO → GR → invoice for stock items.','ME51N → ME21N → MIGO → MIRO','mmpo',['Volume per month?']),
  ('mmf.2','flow','Non-stock / indirect procurement','Buying to cost centre, order or asset.','Account-assigned PO','mmpr',['Which account assignments?']),
  ('mmf.3','flow','Subcontracting','Sending components to a supplier for processing.','Item category L','mmspc',['Which materials / suppliers?']),
  ('mmf.4','flow','Consignment','Supplier-owned stock at your site.','Item category K, MRKO settlement','mmspc',['Settlement frequency?']),
  ('mmf.5','flow','Stock transfer between plants','Moving stock with stock transport orders.','UB order, VL10B, MIGO','mmspc',['One-step or two-step?']),
  ('mmf.6','flow','Returns to supplier','Sending goods back.','Returns PO / movement type 122 / 161','mmgr',['How are credits handled?']),
 ])

# ---------------------------------------------------------------- PM: scheduling object + apps
pm_path = D + 'sap-pm-discovery-catalog.json'
pm = json.load(open(pm_path))
if not any(a['id'] == 'planning' for a in pm['areas']):
    idx = [a['id'] for a in pm['areas']].index('preventive') + 1
    pm['areas'].insert(idx, {'id': 'planning', 'title': 'Planning, scheduling & capacity', 'impliedBy': 'corrective'})
if not any(o['id'] == 'sched' for o in pm['objects']):
    sched = obj('pm','sched','planning','Scheduling & capacity planning (resources)',['IW37N','CM01','CM25','IW38','IP19'],
      'Matching maintenance work to available people and work centres: backlog, planning buckets, weekly schedule, dispatching and utilisation.',
      ['Work centre capacity (people, shifts, hours)','Operation work & duration / number of people','Scheduling type & dates (earliest / latest)','Planning buckets / weekly schedule (freeze window)','Dispatching to people (individual capacities)','Utilisation monitoring (load vs available)','~Maintenance events / revisions (shutdowns)','~Qualifications / skills per person','~Capacity levelling (CM25)','~Order priority / criticality-based sequencing','~External scheduling tool (e.g. SAP FSM, Prometheus, scheduling add-ons)'],
      [('How is maintenance work scheduled today?','single',['Not scheduled — done as it comes','Weekly schedule in Excel / board','Scheduled in the legacy system','Dedicated scheduling tool']),
       ('Is capacity (available hours per craft / work centre) checked before committing work?',YN),
       ('Is work assigned to named technicians or only to the team?','single',['Team / work centre only','Named person','Both']),
       ('Is there a fixed weekly planning cycle (planning meeting, freeze window)?',YN),
       ('How are shutdowns / turnarounds planned?','text'),
       ('Is there a backlog measurement (weeks of work)?',YN)],
      [('Scheduling approach in SAP',['Resource Scheduling apps (Maintenance Scheduling Board etc.)','Planning buckets & backlog (Manage Maintenance Planning Buckets)','Classic capacity planning (CM01/CM25)','External scheduling tool']),
       ('Dispatching level',['Work centre','Person','Both'])],
      [('F2603','Maintenance Scheduling Board','Gantt of orders, operations, sub-operations per work centre incl. utilisation'),
       ('F2227','Resource Scheduling for Maintenance Planners','Work-centre utilisation KPIs and planner entry point'),
       ('F3326','Manage Schedules','Weekly / recurring maintenance schedules'),
       ('F3423','Assign Maintenance Order Operations','Dispatch operations to persons'),
       ('F4577','Manage Maintenance Schedule for Assets'),
       ('F3888A','Manage Maintenance Planning Buckets','Operational & event-based buckets (new version; F3888 is the old one)'),
       ('F4073','Manage Maintenance Backlog','Opened from planning buckets / backlog overview'),
       ('F5105','Maintenance Backlog Overview'),
       (None,'Manage Work Center Utilization','Load vs target utilisation per work centre')])
    pos = max(i for i, o in enumerate(pm['objects']) if o['area'] == 'preventive') + 1
    pm['objects'].insert(pos, sched)
PM_APPS = {
 'fl': [('F2072','Find Technical Object','Find, display, mass edit; install/dismantle')],
 'eq': [('F2072','Find Technical Object','Find, display, mass edit; install/dismantle')],
 'mp': [('F5104A','Perform Maintenance Jobs','Technicians record measurement readings')],
 'notif': [('F1511A','Create Maintenance Request'),('F4513','My Maintenance Requests'),('F4072','Screen Maintenance Requests'),('F5777','Manage Maintenance Notifications'),('F2071','Find Maintenance Notification'),('F4604','Manage Maintenance Notifications and Orders')],
 'order': [('F4604','Manage Maintenance Notifications and Orders','Create orders from notifications, mass edit, release'),('F2175','Find Maintenance Order'),('F2173','Find Maintenance Order and Operation'),('F6178','Manage Components and Services','Externally procured materials & lean services for orders'),('F4603','Maintenance Order Costs')],
 'conf': [('F5104A','Perform Maintenance Jobs','Time, components, measurements, findings; successor of My Maintenance Jobs (F5104)')],
 'mplan': [('F5325','Manage Maintenance Plans'),('F5356','Manage Maintenance Items'),('F4577','Manage Maintenance Schedule for Assets')],
 'cost': [('F4603','Maintenance Order Costs')],
 'kpi': [('F2812','Technical Object Breakdowns'),('F3075','Technical Object Damages'),('F5105','Maintenance Backlog Overview')],
}
for o in pm['objects']:
    if o['id'] in PM_APPS:
        o['apps'] = [{'id': a[0], 'name': a[1], **({'note': a[2]} if len(a) > 2 else {})} for a in PM_APPS[o['id']]]
pm['version'] = '1.1.0'
check_ids(pm['objects'])

json.dump(pm, open(pm_path, 'w'), indent=1, ensure_ascii=False)
json.dump(pp_cat, open(D + 'sap-pp-discovery-catalog.json', 'w'), indent=1, ensure_ascii=False)
json.dump(mm_cat, open(D + 'sap-mm-discovery-catalog.json', 'w'), indent=1, ensure_ascii=False)
json.dump(pp_proc, open(D + 'sap-pp-process-catalog.json', 'w'), indent=1, ensure_ascii=False)
json.dump(mm_proc, open(D + 'sap-mm-process-catalog.json', 'w'), indent=1, ensure_ascii=False)
for name, c in [('PM', pm), ('PP', pp_cat), ('MM', mm_cat)]:
    ob = c['objects']; print(name, len(ob), 'objects', sum(len(o['fields']) for o in ob), 'fields', sum(len(o['questions']) for o in ob), 'questions', sum(len(o['decisions']) for o in ob), 'decisions', sum(len(o.get('apps', [])) for o in ob), 'apps')
