import { db } from "../../database/pool.js";

const STATIC_AMBULANCE_UNIT_CODE = "AMB-BETH-001";
const STATIC_AMBULANCE_LATITUDE = 31.7054;
const STATIC_AMBULANCE_LONGITUDE = 35.2024;

export const systemBootstrapService = {
  ensureStaticAmbulanceSetup: async (): Promise<void> => {
    try {
      await db.query(
        `
        INSERT INTO ambulances (
          unit_code,
          crew_count,
          support_level,
          status,
          current_latitude,
          current_longitude
        )
        VALUES ($1, 2, 'BLS', 'AVAILABLE', $2, $3)
        ON CONFLICT (unit_code) DO UPDATE
        SET
          crew_count = 2,
          support_level = 'BLS',
          status = 'AVAILABLE',
          current_latitude = $2,
          current_longitude = $3,
          updated_at = NOW()
        `,
        [STATIC_AMBULANCE_UNIT_CODE, STATIC_AMBULANCE_LATITUDE, STATIC_AMBULANCE_LONGITUDE]
      );

      await db.query(
        `
        UPDATE ambulances
        SET
          status = 'OFFLINE',
          updated_at = NOW()
        WHERE unit_code <> $1
        `,
        [STATIC_AMBULANCE_UNIT_CODE]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/relation .*ambulances.* does not exist/i.test(message)) {
        console.warn("Skipping static ambulance bootstrap: ambulances table is not ready yet.");
        return;
      }

      throw error;
    }
  }
};
