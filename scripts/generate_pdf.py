import os
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable

def generate_pdf():
    pdf_path = r"d:\projects\Beam Projects 2.0\development\backend\beam_south_backend\docs\NNE_Incident_Management_Form_Field_Keys.pdf"
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Colors
    c_blue = colors.HexColor('#131E40')
    c_red = colors.HexColor('#E32B50')
    c_dark = colors.HexColor('#1c2230')
    c_bg_light = colors.HexColor('#f8fafc')
    c_border = colors.HexColor('#cbd5e1')
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.white
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#cbd5e1')
    )
    
    section_title_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=c_blue,
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'TableBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=c_dark
    )
    
    key_style = ParagraphStyle(
        'TableKey',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0284c7')
    )
    
    type_style = ParagraphStyle(
        'TableType',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#d97706')
    )
    
    th_style = ParagraphStyle(
        'THStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white
    )

    story = []

    # Header Box
    header_data = [
        [
            Paragraph("<b>NNE SAFETYHUB PLATFORM</b>", subtitle_style),
        ],
        [
            Paragraph("Incident Management Field Keys Dictionary", title_style),
        ],
        [
            Paragraph("Official Data Mapping for Heads-Up Notification, Initial Incident Report, & Investigation Templates", subtitle_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[520])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_blue),
        ('PADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,2), (-1,2), 14),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    def make_table(data):
        table_data = []
        # Header row
        table_data.append([
            Paragraph("Template Form Label", th_style),
            Paragraph("API / Database Key", th_style),
            Paragraph("Data Type", th_style),
            Paragraph("Description / Allowed Values", th_style)
        ])
        for row in data:
            table_data.append([
                Paragraph(f"<b>{row[0]}</b>", body_style),
                Paragraph(f"<code>{row[1]}</code>", key_style),
                Paragraph(row[2], type_style),
                Paragraph(row[3], body_style)
            ])
        t = Table(table_data, colWidths=[140, 145, 75, 160])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), c_blue),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('GRID', (0,0), (-1,-1), 0.5, c_border),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light])
        ]))
        return t

    # -------------------------------------------------------------------------
    # STAGE 1
    # -------------------------------------------------------------------------
    story.append(Paragraph("1. Stage 1: Heads-Up Notification Form Keys <font color='#E32B50' size='9'><b>(SLA: Within 2 Hours)</b></font>", section_title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_red, spaceAfter=8, spaceBefore=2))
    
    stage1_data = [
        ("Project Name", "projectName", "string", "Name of active project site"),
        ("Project ID", "projectId", "number", "Internal project identifier"),
        ("Date (YYYY-MM-DD)", "incidentDate", "string", "Occurrence date e.g. '2026-08-19'"),
        ("Time (24hr)", "incidentTime", "string", "Occurrence 24h time e.g. '10:30'"),
        ("Location / Building", "buildingId", "number", "FK to Building entity"),
        ("Floor / Level", "floorLevel", "string", "e.g. 'Level 2 - Cleanroom Suite B'"),
        ("Specific location", "specificLocation", "string", "Detailed room / equipment location"),
        ("Contractor(s) involved", "contractorsInvolved", "string", "Name of contractor company"),
        ("Category Checklist", "categories", "string[]", "Near Miss, Medical Treatment, Loss Time, Environmental, Property Damage, etc."),
        ("Description what happened?", "descriptionWhatHappened", "string", "Narrative detail of events"),
        ("Consequence of incident?", "descriptionConsequence", "string", "Immediate impact / injury summary"),
        ("Environmental Incident", "isEnvironmental", "boolean", "true if chemical/liquid spill occurred"),
        ("Type of Spillage", "spillType", "string[]", "['Oil/hydrocarbon', 'Chemical Spill', 'Paint Spill', 'Other']"),
        ("Spilled Substance (SDS)", "spillSubstance", "string", "Chemical name per SDS sheet"),
        ("Cause of Spillage", "spillCause", "string", "Root cause of liquid spill"),
        ("Approximate Quantity", "spillQuantity", "string", "e.g. '15 Liters' or '25 Kg'"),
        ("System Entered", "spillSystemEntered", "string[]", "['Rainwater', 'Process Wastewater', 'Soil', 'Asphalt', 'Other']"),
        ("Immediate Actions Table", "immediateActions", "object[]", "Array of { action, responsible, targetDate / date, timeImplemented }"),
        ("Gatekeeper Informed?", "gatekeeperInformed", "boolean", "true or false"),
        ("Gatekeeper Name", "gatekeeperName", "string", "Name of gatekeeper notified"),
        ("Submitted By", "submittedBy", "string", "Author name & role"),
        ("Author Signature", "signature", "string", "Base64 digital signature string"),
        ("Approved By (Reviewer)", "approvedBy", "string", "Name of NNE Peer Reviewer"),
        ("Approver Role", "approverRole", "string", "e.g. 'NNE Peer Reviewer'"),
        ("Approver Signature", "approverSignature", "string", "Base64 digital signature string")
    ]
    story.append(make_table(stage1_data))
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # STAGE 2
    # -------------------------------------------------------------------------
    story.append(Paragraph("2. Stage 2: Initial Incident Report Form Keys <font color='#E32B50' size='9'><b>(SLA: Within 24 Hours)</b></font>", section_title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_red, spaceAfter=8, spaceBefore=2))
    
    stage2_data = [
        ("Actual Severity (1-5)", "actualSeverity", "number", "1 (Lowest) to 5 (Fatality)"),
        ("Potential Severity (1-5)", "potentialSeverity", "number", "Worst credible scenario (1-5)"),
        ("High-Potential (HiPo)", "isHipo", "boolean", "Auto-set true if potential >= 4"),
        ("Investigation Level", "investigationLevel", "string", "'L1' (5 Whys), 'L2' (Fishbone+5Whys), 'L3' (TapRooT)"),
        ("Incident Photos", "photos", "string[]", "Min 2 photo URLs (before/after for spill)"),
        ("Injury/Illness Present", "hasInjuryIllness", "boolean", "true or false"),
        ("Nature Of Injury", "natureOfInjury", "string", "Text detail of injury/illness"),
        ("Treatment Prescribed", "treatmentPrescribed", "string", "Prescribed medical treatment"),
        ("Anticipated Absence", "anticipatedAbsence", "string", "e.g. '0 days (Light duties)'"),
        ("Treatment Provided", "treatmentProvided", "string[]", "['On-Site First Aid', 'Off-Site Treatment', 'Medical Center']"),
        ("Accident Categories (22)", "accidentCategories", "string[]", "Electrocution, Crane, Cuts, Slip/Trip/Fall, Heights, Ergonomic, etc."),
        ("Injury Types (21)", "injuryTypes", "string[]", "Abrasion, Dislocation, Concussion, Burn, Fracture, Sprain, Poisoning, etc."),
        ("Body Parts Injured", "bodyPartsInjured", "object", "{ selections: [{ part: 'Hand', side: 'L' }], notes: '...' }"),
        ("Submitted By", "submittedBy", "string", "Name of investigator"),
        ("Approved By", "approvedBy", "string", "Name of Customer Approver"),
        ("Approver Role", "approverRole", "string", "e.g. 'Customer Approver'"),
        ("Approver Signature", "approverSignature", "string", "Base64 digital signature string")
    ]
    story.append(make_table(stage2_data))
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # STAGE 3
    # -------------------------------------------------------------------------
    story.append(Paragraph("3. Stage 3: Incident Investigation Report Form Keys <font color='#E32B50' size='9'><b>(SLA: Within 7 Days)</b></font>", section_title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_red, spaceAfter=8, spaceBefore=2))
    
    stage3_data = [
        ("Investigation Narrative", "investigationDetails", "string", "Process, timelines, tools, systems reviewed"),
        ("Problem Statement", "problemStatement", "string", "Core problem statement header"),
        ("Fishbone Analysis (6-M)", "fishboneData", "object[]", "Categories: People, Machine, Method, Materials, Environment, Measurement"),
        ("5 Whys Analysis Chains", "fiveWhysData", "object[]", "[{ fishboneCauseText, why1, why2, why3, why4, why5, rootCauseSummary }]"),
        ("Identified Root Causes", "rootCauses", "string[]", "List of primary root causes"),
        ("Contributing Factors", "contributingFactors", "string[]", "List of contributing factors"),
        ("Mandatory Attachments", "mandatoryAttachments", "object", "RAMS, PTW, Witness Statements, SPA, Waste Invoice, etc."),
        ("Signatures List", "signatures", "object[]", "[{ role, name, signature, date }]"),
        ("Reviewed By", "reviewedBy", "string", "Name of NNE Lead Reviewer"),
        ("Reviewer Role", "reviewerRole", "string", "e.g. 'NNE Overall Project Manager'"),
        ("Reviewer Signature", "reviewerSignature", "string", "Base64 digital signature string"),
        ("Closed By", "closedBy", "string", "Name of person closing incident"),
        ("Closure Comments", "closureComments", "string", "Final close-out verification notes"),
        ("Closure Signature", "closureSignature", "string", "Base64 digital signature string")
    ]
    story.append(make_table(stage3_data))
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # ACTION ITEMS & FILTERS
    # -------------------------------------------------------------------------
    story.append(Paragraph("4. Action Items (CAPA) & UI Table Column Dropdown Filters", section_title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_red, spaceAfter=8, spaceBefore=2))

    extra_data = [
        ("Action Type", "actionType", "string", "'IMMEDIATE' or 'CORRECTIVE'"),
        ("Action Description", "action", "string", "Text description of action item"),
        ("Responsible Person", "responsible", "string", "Name & role of responsible owner"),
        ("Target Completion Date", "targetDate", "string", "Target date e.g. '2026-08-25'"),
        ("Time Implemented", "timeImplemented", "string", "Implementation timestamp"),
        ("Action Status", "status", "string", "'PENDING' (default), 'IN_PROGRESS', or 'COMPLETED'"),
        ("Updated By (Status Changer)", "updatedBy / statusChangedBy", "string", "User name updating status/action"),
        ("Status Audit History", "statusHistory", "object[]", "Audit log array: [{ status, updatedBy, timestamp, remarks }]"),
        ("Filter: Classification", "category", "query string", "GET /incidents?category=Environmental Incident"),
        ("Filter: Building", "building", "query string", "GET /incidents?building=MA"),
        ("Filter: Actual Severity", "actualSeverity", "query number", "GET /incidents?actualSeverity=2"),
        ("Filter: Potential Severity", "potentialSeverity", "query number", "GET /incidents?potentialSeverity=4"),
        ("Filter: HiPo", "isHipo", "query boolean", "GET /incidents?isHipo=true"),
        ("Filter: Investigation Level", "investigationLevel", "query string", "GET /incidents?investigationLevel=L2"),
        ("Filter: Contractor", "contractor", "query string", "GET /incidents?contractor=Give Steel"),
        ("Filter: Status / Stage", "stage", "query string", "GET /incidents?stage=INITIAL_REPORT"),
        ("Filter: Origin", "origin", "query string", "GET /incidents?origin=Direct")
    ]
    story.append(make_table(extra_data))

    doc.build(story)
    print(f"Successfully generated PDF: {pdf_path}")

if __name__ == '__main__':
    generate_pdf()
