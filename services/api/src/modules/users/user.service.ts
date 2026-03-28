import { AppError } from "../../shared/errors/AppError";
import { userRepository } from "./user.repository";
import { UpdateMedicalProfileInput, UpdateUserProfileInput } from "./user.validation";

const toProfileDto = (row: {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
}) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  avatarUrl: row.avatar_url,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toMedicalDto = (row: {
  id: string;
  user_id: string;
  blood_type: string | null;
  conditions: string | null;
  allergies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  health_data_sharing: boolean;
  created_at: Date;
  updated_at: Date;
}) => ({
  id: row.id,
  userId: row.user_id,
  bloodType: row.blood_type,
  conditions: row.conditions,
  allergies: row.allergies,
  emergencyContactName: row.emergency_contact_name,
  emergencyContactPhone: row.emergency_contact_phone,
  healthDataSharing: row.health_data_sharing,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const userService = {
  getProfile: async (userId: string) => {
    const row = await userRepository.getProfile(userId);

    if (!row) {
      throw new AppError("User not found", 404);
    }

    return toProfileDto(row);
  },

  updateProfile: async (userId: string, input: UpdateUserProfileInput) => {
    const row = await userRepository.updateProfile({
      userId,
      fullName: input.fullName,
      phone: input.phone,
      avatarUrl: input.avatarUrl
    });

    if (!row) {
      throw new AppError("User not found", 404);
    }

    return toProfileDto(row);
  },

  getMedicalProfile: async (userId: string) => {
    await userRepository.ensureMedicalProfile(userId);
    const row = await userRepository.getMedicalProfile(userId);

    if (!row) {
      throw new AppError("Medical profile not found", 404);
    }

    return toMedicalDto(row);
  },

  updateMedicalProfile: async (userId: string, input: UpdateMedicalProfileInput) => {
    await userRepository.ensureMedicalProfile(userId);
    const row = await userRepository.updateMedicalProfile({
      userId,
      bloodType: input.bloodType,
      conditions: input.conditions,
      allergies: input.allergies,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      healthDataSharing: input.healthDataSharing
    });

    if (!row) {
      throw new AppError("Medical profile could not be updated", 500);
    }

    return toMedicalDto(row);
  },

  getHistory: async (userId: string) => {
    const rows = await userRepository.getHistory(userId);

    return rows.map((row) => ({
      id: row.id,
      caseNumber: row.case_number,
      emergencyType: row.emergency_type,
      priority: row.priority,
      status: row.status,
      address: row.address_text,
      createdAt: row.created_at,
      closedAt: row.closed_at
    }));
  }
};
