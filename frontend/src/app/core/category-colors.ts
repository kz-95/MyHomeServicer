export const CATEGORY_COLORS: Record<string, string> = {
  // ── Parents ──
  'cleaning-service': '#5a7a4a',
  'events-weddings': '#b06a7a',
  'home-improvement': '#7a5a8c',
  'home-maintenance': '#c95a3c',
  'appliance-repair': '#c79a34',
  'training-classes': '#5a8c7a',
  'tech-it': '#4f86a0',

  // ── Children ──
  'home-cleaning': '#5a7a4a',
  'sofa-mattress-cleaning': '#6b8a5a',
  'carpet-cleaning': '#7a9a6a',
  'curtain-cleaning': '#8aaa7a',
  'event-planner': '#b06a7a',
  catering: '#c4903a',
  'professional-organizer': '#8a7a5a',
  'aircond-installer': '#4f86a0',
  carpenter: '#8c6a4a',
  renovation: '#7a5a8c',
  'interior-design': '#8c6a5a',
  'door-gate': '#6b6258',
  roof: '#b0753a',
  'aircond-servicer': '#4f86a0',
  plumber: '#c95a3c',
  'electrical-wiring': '#c79a34',
  'washing-machine-repair': '#a08060',
  'refrigerator-repair': '#6090a0',
  'tv-repair': '#606080',
  'oven-repair': '#806060',
  'water-heater-repair': '#608080',
  'ceiling-fan-repair': '#708090',
  'aircond-repair': '#4f86a0',
  'art-class': '#5a8c7a',
  'language-class': '#6a9c8a',
  'music-class': '#7aac9a',
  'home-tutoring': '#5a8c7a',
  'cooking-class': '#8a9a5a',
  'gym-trainer': '#9a8a5a',
  '3d-modeling-class': '#6a7a9a',
  'alarm-cctv': '#4f86a0',
};

export function categoryColor(slug: string): string {
  return CATEGORY_COLORS[slug] || 'var(--color-primary)';
}

export const CATEGORY_ICONS: Record<string, string> = {
  // ── Parents ──
  'cleaning-service': '\u{1F9F9}',
  'events-weddings': '\u{1F48D}',
  'home-improvement': '\u{1F3D7}\uFE0F',
  'home-maintenance': '\u{1F527}',
  'appliance-repair': '\u{1F50C}',
  'training-classes': '\u{1F4DA}',
  'tech-it': '\u{1F4F1}',

  // ── Children ──
  'home-cleaning': '\u{1F9F9}',
  'sofa-mattress-cleaning': '\u{1F9FA}',
  'carpet-cleaning': '\u{1F9F9}',
  'curtain-cleaning': '\u{1F9F9}',
  'event-planner': '\u{1F48D}',
  catering: '\u{1F373}',
  'professional-organizer': '\u{1F4CB}',
  'aircond-installer': '\u{2744}\uFE0F',
  carpenter: '\u{1F528}',
  renovation: '\u{1F3D7}\uFE0F',
  'interior-design': '\u{1F3E8}',
  'door-gate': '\u{1F6AA}',
  roof: '\u{1F3E2}',
  'aircond-servicer': '\u{2744}\uFE0F',
  plumber: '\u{1F527}',
  'electrical-wiring': '\u{26A1}',
  'washing-machine-repair': '\u{1F9FC}',
  'refrigerator-repair': '\u{1F9CA}',
  'tv-repair': '\u{1F4FA}',
  'oven-repair': '\u{1F525}',
  'water-heater-repair': '\u{1F525}',
  'ceiling-fan-repair': '\u{1F4A8}',
  'aircond-repair': '\u{2744}\uFE0F',
  'art-class': '\u{1F3A8}',
  'language-class': '\u{1F30D}',
  'music-class': '\u{1F3B5}',
  'home-tutoring': '\u{1F4DA}',
  'cooking-class': '\u{1F373}',
  'gym-trainer': '\u{1F4AA}',
  '3d-modeling-class': '\u{1F3AE}',
  'alarm-cctv': '\u{1F4E1}',
};

export function categoryIcon(slug: string): string {
  return CATEGORY_ICONS[slug] || '\u{1F3E0}';
}

const SLUG_PLACEHOLDER: Record<string, string> = {
  // ── Parents ──
  'cleaning-service': 'Cleaning_Category01_Placeholder.png',
  'events-weddings': 'Events_Category01_Placeholder.png',
  'home-improvement': 'HomeImprovement_Category01_Placeholder.png',
  'home-maintenance': 'HomeMaintenance_Category01_Placeholder.png',
  'appliance-repair': 'ApplianceRepair_Category01_Placeholder.png',
  'training-classes': 'Training_Category01_Placeholder.png',
  'tech-it': 'TechIT_Category01_Placeholder.png',

  // ── Children ──
  'home-cleaning': 'Cleaning_HomeCleaning_Deep01_Placeholder.png',
  'sofa-mattress-cleaning': 'Cleaning_SofaMattress_Steam01_Placeholder.png',
  'carpet-cleaning': 'Cleaning_Carpet_Wash01_Placeholder.png',
  'curtain-cleaning': 'Cleaning_Curtain_Wash01_Placeholder.png',
  'event-planner': 'Events_Planner_Plan01_Placeholder.png',
  catering: 'Events_Catering_Cook01_Placeholder.png',
  'aircond-installer': 'HomeImprovement_AircondInstaller_Install01_Placeholder.png',
  carpenter: 'HomeImprovement_Carpenter_Build01_Placeholder.png',
  renovation: 'HomeImprovement_Renovation_Renovate01_Placeholder.png',
  'professional-organizer': 'HomeImprovement_Organizer_Organize01_Placeholder.png',
  'interior-design': 'HomeImprovement_InteriorDesign_Design01_Placeholder.png',
  'door-gate': 'HomeImprovement_DoorGate_Install01_Placeholder.png',
  roof: 'HomeImprovement_Roof_Repair01_Placeholder.png',
  'aircond-servicer': 'HomeMaintenance_AircondServicer_Service01_Placeholder.png',
  plumber: 'HomeMaintenance_Plumber_Fix01_Placeholder.png',
  'electrical-wiring': 'HomeMaintenance_ElectricalWiring_Wire01_Placeholder.png',
  'washing-machine-repair': 'ApplianceRepair_WashingMachine_Fix01_Placeholder.png',
  'refrigerator-repair': 'ApplianceRepair_Refrigerator_Fix01_Placeholder.png',
  'tv-repair': 'ApplianceRepair_TV_Fix01_Placeholder.png',
  'oven-repair': 'ApplianceRepair_Oven_Fix01_Placeholder.png',
  'water-heater-repair': 'ApplianceRepair_WaterHeater_Fix01_Placeholder.png',
  'ceiling-fan-repair': 'ApplianceRepair_CeilingFan_Fix01_Placeholder.png',
  'aircond-repair': 'ApplianceRepair_Aircond_Fix01_Placeholder.png',
  'art-class': 'Training_Art_Teach01_Placeholder.png',
  'language-class': 'Training_Language_Teach01_Placeholder.png',
  'music-class': 'Training_Music_Teach01_Placeholder.png',
  'home-tutoring': 'Training_HomeTutoring_Teach01_Placeholder.png',
  'cooking-class': 'Training_Cooking_Teach01_Placeholder.png',
  'gym-trainer': 'Training_GymTrainer_Train01_Placeholder.png',
  '3d-modeling-class': 'Training_3DModeling_Teach01_Placeholder.png',
  'alarm-cctv': 'TechIT_AlarmCCTV_Install01_Placeholder.png',
};

export function placeholderUrl(slug: string): string {
  return '/assets/Images/' + (SLUG_PLACEHOLDER[slug] || 'Banner_Placeholder.png');
}
