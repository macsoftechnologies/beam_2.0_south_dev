import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRequestDto {
  @IsOptional()
  rams_file?: any;

  @IsString()
  @IsOptional()
  rams_number?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  userId?: number;

  @IsString()
  @IsOptional()
  Company_Name?: string;

  @IsString()
  @IsOptional()
  PermitNo?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Sub_Contractor_Id?: number;

  @IsString()
  @IsOptional()
  Foreman?: string;

  @IsString()
  @IsOptional()
  Foreman_Phone_Number?: string;

  @IsString()
  @IsOptional()
  Activity?: string;

  @IsString()
  @IsOptional()
  Type_Of_Activity_Id?: string;

  @IsString()
  @IsOptional()
  Request_Date?: string;

  @IsString()
  @IsOptional()
  Working_Date?: string;

  @IsString()
  @IsOptional()
  Start_Time?: string;

  @IsString()
  @IsOptional()
  End_Time?: string;

  @IsString()
  @IsOptional()
  Assign_Start_Time?: string;

  @IsString()
  @IsOptional()
  Assign_End_Time?: string;

  @IsString()
  @IsOptional()
  Assign_Start_Date?: string;

  @IsString()
  @IsOptional()
  Assign_End_Date?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Building_Id?: number;

  @IsOptional()
  Floor_Id?: any;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Plans_Id?: number;

  @IsOptional()
  Zone_Id?: any;

  @IsString()
  @IsOptional()
  zone?: string;

  @IsString()
  @IsOptional()
  Room_Nos?: string;

  @IsString()
  @IsOptional()
  Room_Type?: string;

  @IsString()
  @IsOptional()
  Number_Of_Workers?: string;

  @IsString()
  @IsOptional()
  Badge_Numbers?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  teamId?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  Request_status?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  status?: number;

  @IsOptional()
  createdTime?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Site_Id?: number;

  @IsString()
  @IsOptional()
  permit_type?: string;

  @IsString()
  @IsOptional()
  permit_under?: string;

  @IsString()
  @IsOptional()
  new_date?: string;

  @IsString()
  @IsOptional()
  new_end_time?: string;

  @IsString()
  @IsOptional()
  night_shift?: string;

  @IsString()
  @IsOptional()
  Safety_Precautions?: string;

  @IsString()
  @IsOptional()
  denmark_time?: string;

  // 1. Chemical Hazard fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_hazardious_substen?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  relevant_mal?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  msds?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  equipment_taken_account?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ventilation?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  hazardous_substances?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  storage_and_disposal?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  reachable_case?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  checical_risk_assessment?: number;

  // 2. Confined Spaces fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_confined_spaces?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  vapours_gases?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lel_measurement?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  all_equipment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  exit_conditions?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  communication_emergency?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  rescue_equipments?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  space_ventilation?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  oxygen_meter?: number;

  // 3. Electrical fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_on_electrical_system?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  responsible_for_the_informed?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  de_energized?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  if_not_loto?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  do_risk_assessment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  electricity_have_isulation?: number;

  // 4. Energising Electrical fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  power_on?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  energising_equipment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  isolating_live?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_near_live?: number;

  @IsString()
  @IsOptional()
  responsible_for_the_area?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  risk_assessment_done?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  barriers_signage?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  arc_flash?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  energized_been_tested?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  punches_been_closed?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  toct_checklist?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  informed_aligned?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  isolating_resposible?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  isolating_responsible?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  isolating_risk_assessment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  cq_informed?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  cq_provided?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  de_energisation_request?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ppe_prepared?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  absence_of_voltage?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  stored_energy?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  backup_power?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  unavoidable?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  reasonably_practicable?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  work_authorised?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_risk_assessment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_arc_boundary?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_barriers?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  insulated_tools?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  event_of_emergency?: number;

  // 5. Energising Mechanical fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pressurization?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  performed_approved?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  flushing_approved?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  mc_approved?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  visual_inspection?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  loto_plan_approved?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  follow_media_code?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  cq_safety_signs?: number;

  @IsString()
  @IsOptional()
  mc_number_text?: string;

  // 6. Excavation fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  excavation_shoring?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  excavation_segregated?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  nn_standards?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  danish_regulation?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  safe_access_and_egress?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  correctly_sloped?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  inspection_dates?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  marked_drawings?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  underground_areas_cleared?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  excavation_works?: number;

  // 7. Extra Misc fields
  @IsString()
  @IsOptional()
  Tools?: string;

  @IsString()
  @IsOptional()
  Machinery?: string;

  @IsString()
  @IsOptional()
  description_of_activity?: string;

  @IsString()
  @IsOptional()
  mechanical_works?: string;

  @IsString()
  @IsOptional()
  electrical_works?: string;

  @IsString()
  @IsOptional()
  ConM_initials?: string;

  @IsString()
  @IsOptional()
  ConM_initials1?: string;

  @IsString()
  @IsOptional()
  CoMM_initials?: string;

  @IsString()
  @IsOptional()
  reject_reason?: string;

  @IsString()
  @IsOptional()
  cancel_reason?: string;

  @IsString()
  @IsOptional()
  close_note?: string;

  @IsString()
  @IsOptional()
  new_sub_contractor?: string;

  @IsString()
  @IsOptional()
  work_type?: string;

  // 8. Fire/Hotwork fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Hot_work?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  fire_watch_establish?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  combustible_material?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  safety_measures?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  extinguishers_and_fire_blanket?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  welding_activity?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  heat_treatment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  air_extraction_be_established?: number;

  @IsString()
  @IsOptional()
  name_of_the_fire_watcher?: string;

  @IsString()
  @IsOptional()
  phone_number_of_the_fire_watcher?: string;

  @IsString()
  @IsOptional()
  fire_guard_present?: string;

  @IsString()
  @IsOptional()
  low_risk_hotwork?: string;

  @IsString()
  @IsOptional()
  high_risk_hotwork?: string;

  @IsString()
  @IsOptional()
  hot_work_checklist_filled?: string;

  @IsString()
  @IsOptional()
  h_heat_source?: string;

  @IsString()
  @IsOptional()
  h_workplace_check?: string;

  @IsString()
  @IsOptional()
  h_fire_detectors?: string;

  @IsString()
  @IsOptional()
  h_start_time?: string;

  @IsString()
  @IsOptional()
  h_end_time?: string;

  @IsString()
  @IsOptional()
  fire_image?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  tasks_in_progress_in_the_area?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  account_during_the_work?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lighting_sufficiently?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  specific_risks_based_on_task?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  work_environment_safety_ensured?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  course_of_action_in_emergencies?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  if_no_loto?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  hazardaus_substances?: number;

  // 9. General fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  affecting_other_contractors?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  other_conditions?: number;

  @IsString()
  @IsOptional()
  other_conditions_input?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lighting_begin_work?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  specific_risks?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  environment_ensured?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  course_of_actions?: number;

  // 10. Height fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  working_at_height?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  segragated_demarkated?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lanyard_attachments?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  rescue_plan?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  avoid_hazards?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  height_equipments?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  supervision?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  shock_absorbing?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  vertical_life?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  secured_falling?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  dropped_objects?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  safe_acces?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  weather_acceptable?: number;

  // 11. Lifting fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  using_cranes_or_lifting?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  appointed_person?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  vendor_supplies?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lift_plan?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  supplied_and_inspected?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  legal_required_certificates?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  prapared_lifting?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  lifting_task_fenced?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  overhead_risks?: number;

  // 12. PPE fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  specific_gloves?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  eye_protection?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  fall_protection?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  hearing_protection?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  respiratory_protection?: number;

  @IsString()
  @IsOptional()
  other_ppe?: string;

  // 13. Pressure Testing fields
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pressure_testing_of_equipment?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  line_walk?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pressure_test_coordinated?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pipework_mic?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  loto_plan_attached?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  exclusion_zone_calculated?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  pnematic_hydrostatic?: number;

  @IsString()
  @IsOptional()
  pressure_of_the_test?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  safety_valves_calibrated?: number;

  @IsString()
  @IsOptional()
  pressure_pneumatic?: string;

  @IsString()
  @IsOptional()
  pressure_hydrostatic?: string;

  // Base64 image
  @IsString()
  @IsOptional()
  Image1?: string;

  // Field change logs passed from frontend on edit
  @IsOptional()
  fields?: any;

  @IsOptional()
  vendor_supplier?: any;

  @IsOptional()
  welding_activitiy?: any;

  @IsOptional()
  pneumatic_hydrostatic?: any;

  @IsOptional()
  height_training?: any;

  @IsString()
  @IsOptional()
  tools?: string;

  @IsString()
  @IsOptional()
  machinery?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  course_of_action?: number;
}
