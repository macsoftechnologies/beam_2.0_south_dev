import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('request_chemical_hazard')
export class RequestChemicalHazard {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'working_hazardious_substen', type: 'int', nullable: true })
  workingHazardiousSubsten?: number;

  @Column({ name: 'relevant_mal', type: 'int', nullable: true })
  relevantMal?: number;

  @Column({ name: 'msds', type: 'int', nullable: true })
  msds?: number;

  @Column({ name: 'equipment_taken_account', type: 'int', nullable: true })
  equipmentTakenAccount?: number;

  @Column({ name: 'ventilation', type: 'int', nullable: true })
  ventilation?: number;

  @Column({ name: 'hazardous_substances', type: 'int', nullable: true })
  hazardousSubstances?: number;

  @Column({ name: 'storage_and_disposal', type: 'int', nullable: true })
  storageAndDisposal?: number;

  @Column({ name: 'reachable_case', type: 'int', nullable: true })
  reachableCase?: number;

  @Column({ name: 'checical_risk_assessment', type: 'int', nullable: true })
  checicalRiskAssessment?: number;
}

@Entity('request_confined')
export class RequestConfined {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'working_confined_spaces', type: 'int', nullable: true })
  workingConfinedSpaces?: number;

  @Column({ name: 'vapours_gases', type: 'int', nullable: true })
  vapoursGases?: number;

  @Column({ name: 'lel_measurement', type: 'int', nullable: true })
  lelMeasurement?: number;

  @Column({ name: 'all_equipment', type: 'int', nullable: true })
  allEquipment?: number;

  @Column({ name: 'exit_conditions', type: 'int', nullable: true })
  exitConditions?: number;

  @Column({ name: 'communication_emergency', type: 'int', nullable: true })
  communicationEmergency?: number;

  @Column({ name: 'rescue_equipments', type: 'int', nullable: true })
  rescueEquipments?: number;

  @Column({ name: 'space_ventilation', type: 'int', nullable: true })
  spaceVentilation?: number;

  @Column({ name: 'oxygen_meter', type: 'int', nullable: true })
  oxygenMeter?: number;
}

@Entity('request_electrical')
export class RequestElectrical {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'working_on_electrical_system', type: 'int', nullable: true })
  workingOnElectricalSystem?: number;

  @Column({ name: 'responsible_for_the_informed', type: 'int', nullable: true })
  responsibleForTheInformed?: number;

  @Column({ name: 'de_energized', type: 'int', nullable: true })
  deEnergized?: number;

  @Column({ name: 'if_not_loto', type: 'int', nullable: true })
  ifNotLoto?: number;

  @Column({ name: 'do_risk_assessment', type: 'int', nullable: true })
  doRiskAssessment?: number;

  @Column({ name: 'electricity_have_isulation', type: 'int', nullable: true })
  electricityHaveIsulation?: number;
}

@Entity('request_energising_electrical')
export class RequestEnergisingElectrical {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'power_on', type: 'tinyint', default: 0 })
  powerOn: number;

  @Column({ name: 'energising_equipment', type: 'tinyint', default: 0 })
  energisingEquipment: number;

  @Column({ name: 'isolating_live', type: 'tinyint', default: 0 })
  isolatingLive: number;

  @Column({ name: 'working_near_live', type: 'tinyint', default: 0 })
  workingNearLive: number;

  @Column({ name: 'responsible_for_the_area', type: 'varchar', length: 255, nullable: true })
  responsibleForTheArea?: string;

  @Column({ name: 'risk_assessment_done', type: 'tinyint', default: 0 })
  riskAssessmentDone: number;

  @Column({ name: 'barriers_signage', type: 'tinyint', default: 0 })
  barriersSignage: number;

  @Column({ name: 'arc_flash', type: 'tinyint', default: 0 })
  arcFlash: number;

  @Column({ name: 'energized_been_tested', type: 'tinyint', default: 0 })
  energizedBeenTested: number;

  @Column({ name: 'punches_been_closed', type: 'tinyint', default: 0 })
  punchesBeenClosed: number;

  @Column({ name: 'toct_checklist', type: 'tinyint', default: 0 })
  toctChecklist: number;

  @Column({ name: 'informed_aligned', type: 'tinyint', default: 0 })
  informedAligned: number;

  @Column({ name: 'isolating_responsible', type: 'tinyint', default: 0 })
  isolatingResponsible: number;

  @Column({ name: 'isolating_risk_assessment', type: 'tinyint', default: 0 })
  isolatingRiskAssessment: number;

  @Column({ name: 'cq_informed', type: 'tinyint', default: 0 })
  cqInformed: number;

  @Column({ name: 'cq_provided', type: 'tinyint', default: 0 })
  cqProvided: number;

  @Column({ name: 'de_energisation_request', type: 'tinyint', default: 0 })
  deEnergisationRequest: number;

  @Column({ name: 'ppe_prepared', type: 'tinyint', default: 0 })
  ppePrepared: number;

  @Column({ name: 'absence_of_voltage', type: 'tinyint', default: 0 })
  absenceOfVoltage: number;

  @Column({ name: 'stored_energy', type: 'tinyint', default: 0 })
  storedEnergy: number;

  @Column({ name: 'backup_power', type: 'tinyint', default: 0 })
  backupPower: number;

  @Column({ name: 'unavoidable', type: 'tinyint', default: 0 })
  unavoidable: number;

  @Column({ name: 'reasonably_practicable', type: 'tinyint', default: 0 })
  reasonablyPracticable: number;

  @Column({ name: 'work_authorised', type: 'tinyint', default: 0 })
  workAuthorised: number;

  @Column({ name: 'working_risk_assessment', type: 'tinyint', default: 0 })
  workingRiskAssessment: number;

  @Column({ name: 'working_arc_boundary', type: 'tinyint', default: 0 })
  workingArcBoundary: number;

  @Column({ name: 'working_barriers', type: 'tinyint', default: 0 })
  workingBarriers: number;

  @Column({ name: 'insulated_tools', type: 'tinyint', default: 0 })
  insulatedTools: number;

  @Column({ name: 'event_of_emergency', type: 'tinyint', default: 0 })
  eventOfEmergency: number;
}

@Entity('request_energising_mechanical')
export class RequestEnergisingMechanical {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'pressurization', type: 'tinyint', default: 0 })
  pressurization: number;

  @Column({ name: 'performed_approved', type: 'tinyint', default: 0 })
  performedApproved: number;

  @Column({ name: 'flushing_approved', type: 'tinyint', default: 0 })
  flushingApproved: number;

  @Column({ name: 'mc_approved', type: 'tinyint', default: 0 })
  mcApproved: number;

  @Column({ name: 'visual_inspection', type: 'tinyint', default: 0 })
  visualInspection: number;

  @Column({ name: 'loto_plan_approved', type: 'tinyint', default: 0 })
  lotoPlanApproved: number;

  @Column({ name: 'follow_media_code', type: 'tinyint', default: 0 })
  followMediaCode: number;

  @Column({ name: 'cq_safety_signs', type: 'tinyint', default: 0 })
  cqSafetySigns: number;

  @Column({ name: 'mc_number_text', type: 'text', nullable: true })
  mcNumberText?: string;
}

@Entity('request_excavation')
export class RequestExcavation {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'excavation_shoring', type: 'int', nullable: true })
  excavationShoring?: number;

  @Column({ name: 'excavation_segregated', type: 'int', nullable: true })
  excavationSegregated?: number;

  @Column({ name: 'nn_standards', type: 'int', nullable: true })
  nnStandards?: number;

  @Column({ name: 'danish_regulation', type: 'int', nullable: true })
  danishRegulation?: number;

  @Column({ name: 'safe_access_and_egress', type: 'int', nullable: true })
  safeAccessAndEgress?: number;

  @Column({ name: 'correctly_sloped', type: 'int', nullable: true })
  correctlySloped?: number;

  @Column({ name: 'inspection_dates', type: 'int', nullable: true }) // note: in PHP create.php it was in $dateFields but in DB it's int(11)
  inspectionDates?: number;

  @Column({ name: 'marked_drawings', type: 'int', nullable: true })
  markedDrawings?: number;

  @Column({ name: 'underground_areas_cleared', type: 'int', nullable: true })
  undergroundAreasCleared?: number;

  @Column({ name: 'excavation_works', type: 'int', nullable: true })
  excavationWorks?: number;
}

@Entity('request_extra_misc')
export class RequestExtraMisc {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'Tools', type: 'text', nullable: true })
  tools?: string;

  @Column({ name: 'Machinery', type: 'text', nullable: true })
  machinery?: string;

  @Column({ name: 'description_of_activity', type: 'text', nullable: true })
  descriptionOfActivity?: string;

  @Column({ name: 'mechanical_works', type: 'text', nullable: true })
  mechanicalWorks?: string;

  @Column({ name: 'electrical_works', type: 'text', nullable: true })
  electricalWorks?: string;

  @Column({ name: 'ConM_initials', type: 'varchar', length: 255, nullable: true })
  conMInitials?: string;

  @Column({ name: 'ConM_initials1', type: 'varchar', length: 255, nullable: true })
  conMInitials1?: string;

  @Column({ name: 'CoMM_initials', type: 'varchar', length: 255, nullable: true })
  coMMInitials?: string;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason?: string;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string;

  @Column({ name: 'close_note', type: 'text', nullable: true })
  closeNote?: string;

  @Column({ name: 'close_reason', type: 'text', nullable: true })
  closeReason?: string;

  @Column({ name: 'new_sub_contractor', type: 'varchar', length: 200, nullable: true })
  newSubContractor?: string;

  @Column({ name: 'work_type', type: 'varchar', length: 200, nullable: true })
  workType?: string;

  @Column({ name: 'rams_number', type: 'varchar', length: 5000, nullable: true })
  ramsNumber?: string;
}

@Entity('request_fire_hotwork')
export class RequestFireHotwork {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'Hot_work', type: 'int', nullable: true })
  hotWork?: number;

  @Column({ name: 'fire_watch_establish', type: 'int', nullable: true })
  fireWatchEstablish?: number;

  @Column({ name: 'combustible_material', type: 'int', nullable: true })
  combustibleMaterial?: number;

  @Column({ name: 'safety_measures', type: 'int', nullable: true })
  safetyMeasures?: number;

  @Column({ name: 'extinguishers_and_fire_blanket', type: 'int', nullable: true })
  extinguishersAndFireBlanket?: number;

  @Column({ name: 'welding_activity', type: 'int', nullable: true })
  weldingActivity?: number;

  @Column({ name: 'heat_treatment', type: 'int', nullable: true })
  heatTreatment?: number;

  @Column({ name: 'air_extraction_be_established', type: 'int', nullable: true })
  airExtractionBeEstablished?: number;

  @Column({ name: 'name_of_the_fire_watcher', type: 'varchar', length: 200, nullable: true })
  nameOfTheFireWatcher?: string;

  @Column({ name: 'phone_number_of_the_fire_watcher', type: 'varchar', length: 200, nullable: true })
  phoneNumberOfTheFireWatcher?: string;

  @Column({ name: 'fire_guard_present', type: 'text', nullable: true })
  fireGuardPresent?: string;

  @Column({ name: 'low_risk_hotwork', type: 'text', nullable: true })
  lowRiskHotwork?: string;

  @Column({ name: 'high_risk_hotwork', type: 'text', nullable: true })
  highRiskHotwork?: string;

  @Column({ name: 'hot_work_checklist_filled', type: 'text', nullable: true })
  hotWorkChecklistFilled?: string;

  @Column({ name: 'h_heat_source', type: 'varchar', length: 4, nullable: true })
  hHeatSource?: string;

  @Column({ name: 'h_workplace_check', type: 'varchar', length: 4, nullable: true })
  hWorkplaceCheck?: string;

  @Column({ name: 'h_fire_detectors', type: 'varchar', length: 4, nullable: true })
  hFireDetectors?: string;

  @Column({ name: 'h_start_time', type: 'varchar', length: 255, nullable: true })
  hStartTime?: string;

  @Column({ name: 'h_end_time', type: 'varchar', length: 255, nullable: true })
  hEndTime?: string;

  @Column({ name: 'fire_image', type: 'varchar', length: 225, nullable: true })
  fireImage?: string;

  @Column({ name: 'tasks_in_progress_in_the_area', type: 'int', nullable: true })
  tasksInProgressInTheArea?: number;

  @Column({ name: 'account_during_the_work', type: 'int', nullable: true })
  accountDuringTheWork?: number;

  @Column({ name: 'lighting_sufficiently', type: 'int', nullable: true })
  lightingSufficiently?: number;

  @Column({ name: 'specific_risks_based_on_task', type: 'int', nullable: true })
  specificRisksBasedOnTask?: number;

  @Column({ name: 'work_environment_safety_ensured', type: 'int', nullable: true })
  workEnvironmentSafetyEnsured?: number;

  @Column({ name: 'course_of_action_in_emergencies', type: 'int', nullable: true })
  courseOfActionInEmergencies?: number;

  @Column({ name: 'if_no_loto', type: 'int', nullable: true })
  ifNoLoto?: number;

  @Column({ name: 'hazardaus_substances', type: 'int', nullable: true })
  hazardausSubstances?: number;
}

@Entity('request_general')
export class RequestGeneral {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'affecting_other_contractors', type: 'int', nullable: true })
  affectingOtherContractors?: number;

  @Column({ name: 'other_conditions', type: 'int', nullable: true })
  otherConditions?: number;

  @Column({ name: 'other_conditions_input', type: 'varchar', length: 225, nullable: true })
  otherConditionsInput?: string;

  @Column({ name: 'lighting_begin_work', type: 'int', nullable: true })
  lightingBeginWork?: number;

  @Column({ name: 'specific_risks', type: 'int', nullable: true })
  specificRisks?: number;

  @Column({ name: 'environment_ensured', type: 'int', nullable: true })
  environmentEnsured?: number;

  @Column({ name: 'course_of_actions', type: 'int', nullable: true })
  courseOfActions?: number;
}

@Entity('request_height')
export class RequestHeight {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'working_at_height', type: 'int', nullable: true })
  workingAtHeight?: number;

  @Column({ name: 'segragated_demarkated', type: 'int', nullable: true })
  segragatedDemarkated?: number;

  @Column({ name: 'lanyard_attachments', type: 'int', nullable: true })
  lanyardAttachments?: number;

  @Column({ name: 'rescue_plan', type: 'int', nullable: true })
  rescuePlan?: number;

  @Column({ name: 'avoid_hazards', type: 'int', nullable: true })
  avoidHazards?: number;

  @Column({ name: 'height_training', type: 'int', nullable: true })
  heightTraining?: number;

  @Column({ name: 'height_equipments', type: 'int', nullable: true })
  heightEquipments?: number;

  @Column({ name: 'supervision', type: 'int', nullable: true })
  supervision?: number;

  @Column({ name: 'shock_absorbing', type: 'int', nullable: true })
  shockAbsorbing?: number;

  @Column({ name: 'vertical_life', type: 'int', nullable: true })
  verticalLife?: number;

  @Column({ name: 'secured_falling', type: 'int', nullable: true })
  securedFalling?: number;

  @Column({ name: 'dropped_objects', type: 'int', nullable: true })
  droppedObjects?: number;

  @Column({ name: 'safe_acces', type: 'int', nullable: true })
  safeAcces?: number;

  @Column({ name: 'weather_acceptable', type: 'int', nullable: true })
  weatherAcceptable?: number;
}

@Entity('request_lifting')
export class RequestLifting {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'using_cranes_or_lifting', type: 'int', nullable: true })
  usingCranesOrLifting?: number;

  @Column({ name: 'appointed_person', type: 'int', nullable: true })
  appointedPerson?: number;

  @Column({ name: 'vendor_supplies', type: 'int', nullable: true })
  vendorSupplies?: number;

  @Column({ name: 'lift_plan', type: 'int', nullable: true })
  liftPlan?: number;

  @Column({ name: 'supplied_and_inspected', type: 'int', nullable: true })
  suppliedAndInspected?: number;

  @Column({ name: 'legal_required_certificates', type: 'int', nullable: true })
  legalRequiredCertificates?: number;

  @Column({ name: 'prapared_lifting', type: 'int', nullable: true })
  praparedLifting?: number;

  @Column({ name: 'lifting_task_fenced', type: 'int', nullable: true })
  liftingTaskFenced?: number;

  @Column({ name: 'overhead_risks', type: 'int', nullable: true })
  overheadRisks?: number;
}

@Entity('request_ppe')
export class RequestPpe {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'specific_gloves', type: 'tinyint', nullable: true })
  specificGloves?: number;

  @Column({ name: 'eye_protection', type: 'tinyint', nullable: true })
  eyeProtection?: number;

  @Column({ name: 'fall_protection', type: 'tinyint', nullable: true })
  fallProtection?: number;

  @Column({ name: 'hearing_protection', type: 'tinyint', nullable: true })
  hearingProtection?: number;

  @Column({ name: 'respiratory_protection', type: 'tinyint', nullable: true })
  respiratoryProtection?: number;

  @Column({ name: 'other_ppe', type: 'text', nullable: true })
  otherPpe?: string;
}

@Entity('request_pressure_testing')
export class RequestPressureTesting {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'pressure_testing_of_equipment', type: 'int', nullable: true })
  pressureTestingOfEquipment?: number;

  @Column({ name: 'line_walk', type: 'tinyint', default: 0 })
  lineWalk: number;

  @Column({ name: 'pressure_test_coordinated', type: 'tinyint', default: 0 })
  pressureTestCoordinated: number;

  @Column({ name: 'pipework_mic', type: 'tinyint', default: 0 })
  pipeworkMic: number;

  @Column({ name: 'loto_plan_attached', type: 'tinyint', default: 0 })
  lotoPlanAttached: number;

  @Column({ name: 'exclusion_zone_calculated', type: 'tinyint', default: 0 })
  exclusionZoneCalculated: number;

  @Column({ name: 'pnematic_hydrostatic', type: 'tinyint', default: 0 }) // note: db has pnematic_hydrostatic (typo in DB column name)
  pnematicHydrostatic: number;

  @Column({ name: 'pressure_of_the_test', type: 'varchar', length: 255, nullable: true })
  pressureOfTheTest?: string;

  @Column({ name: 'safety_valves_calibrated', type: 'tinyint', default: 0 })
  safetyValvesCalibrated: number;

  @Column({ name: 'pressure_pneumatic', type: 'text', nullable: true })
  pressurePneumatic?: string;

  @Column({ name: 'pressure_hydrostatic', type: 'text', nullable: true })
  pressureHydrostatic?: string;
}
