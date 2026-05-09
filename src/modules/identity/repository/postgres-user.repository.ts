import { eq } from 'drizzle-orm';
import type { Db } from '../../../shared/database/index.js';
import { users } from '../../../shared/database/index.js';
import type { IUserRepository, User, CreateUserDTO } from '../domain/types.js';

const ANONYMISED = '[REDACTED]';

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly db: Db) {}

  async create(dto: CreateUserDTO): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        email: dto.email,
        passwordHash: dto.passwordHash,
        consentGivenAt: dto.consentGivenAt,
      })
      .returning();

    if (!row) throw new Error('User insert returned no rows');
    return this.toUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? this.toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? this.toUser(row) : null;
  }

  async anonymise(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        email: `${ANONYMISED}@anonymised.invalid`,
        passwordHash: ANONYMISED,
        consentWithdrawnAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  private toUser(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      consentGivenAt: row.consentGivenAt,
      consentWithdrawnAt: row.consentWithdrawnAt ?? null,
      createdAt: row.createdAt,
    };
  }
}
