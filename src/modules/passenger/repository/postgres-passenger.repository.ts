import { eq, and } from 'drizzle-orm';
import type { Db } from '../../../shared/database/index.js';
import { passengerProfiles } from '../../../shared/database/index.js';
import { ForbiddenError } from '../../../shared/errors/index.js';
import type {
  IPassengerRepository,
  PassengerProfile,
  CreatePassengerProfileDTO,
} from '../domain/types.js';

const REDACTED = '[REDACTED]';

export class PostgresPassengerRepository implements IPassengerRepository {
  constructor(private readonly db: Db) {}

  async create(dto: CreatePassengerProfileDTO): Promise<PassengerProfile> {
    const [row] = await this.db
      .insert(passengerProfiles)
      .values({
        userId: dto.userId,
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
      })
      .returning();

    if (!row) throw new Error('PassengerProfile insert returned no rows');
    return this.toProfile(row);
  }

  async findByUserId(userId: string): Promise<PassengerProfile[]> {
    const rows = await this.db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.userId, userId));
    return rows.map((r) => this.toProfile(r));
  }

  async findById(id: string): Promise<PassengerProfile | null> {
    const [row] = await this.db
      .select()
      .from(passengerProfiles)
      .where(eq(passengerProfiles.id, id))
      .limit(1);
    return row ? this.toProfile(row) : null;
  }

  async delete(id: string, userId: string): Promise<void> {
    const profile = await this.findById(id);
    if (profile && profile.userId !== userId) throw new ForbiddenError();
    await this.db
      .delete(passengerProfiles)
      .where(and(eq(passengerProfiles.id, id), eq(passengerProfiles.userId, userId)));
  }

  async anonymiseByUserId(userId: string): Promise<void> {
    await this.db
      .update(passengerProfiles)
      .set({
        fullName: REDACTED,
        dateOfBirth: REDACTED,
        documentNumber: REDACTED,
        isAnonymised: true,
      })
      .where(eq(passengerProfiles.userId, userId));
  }

  private toProfile(row: typeof passengerProfiles.$inferSelect): PassengerProfile {
    return {
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      isAnonymised: row.isAnonymised,
      createdAt: row.createdAt,
    };
  }
}
