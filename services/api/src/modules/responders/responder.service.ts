import { responderRepository } from "./responder.repository.js";

export const responderService = {
  listAllResponders: async () => {
    const [volunteers, ambulances] = await Promise.all([
      responderRepository.listVolunteers(),
      responderRepository.listAmbulances()
    ]);

    return {
      volunteers: volunteers.map((volunteer) => ({
        id: volunteer.id,
        userId: volunteer.user_id,
        name: volunteer.full_name,
        specialty: volunteer.specialty,
        availability: volunteer.availability,
        responseRadiusKm: Number(volunteer.response_radius_km),
        location: {
          latitude: volunteer.current_latitude ? Number(volunteer.current_latitude) : null,
          longitude: volunteer.current_longitude ? Number(volunteer.current_longitude) : null
        }
      })),
      ambulances: ambulances.map((ambulance) => ({
        id: ambulance.id,
        unitCode: ambulance.unit_code,
        status: ambulance.status,
        supportLevel: ambulance.support_level,
        crewCount: ambulance.crew_count,
        location: {
          latitude: ambulance.current_latitude ? Number(ambulance.current_latitude) : null,
          longitude: ambulance.current_longitude ? Number(ambulance.current_longitude) : null
        }
      }))
    };
  }
};
