import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = async (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
