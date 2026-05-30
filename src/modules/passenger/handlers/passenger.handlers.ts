import type { Request, Response, NextFunction } from 'express';
import { SavePassengerProfileSchema } from '../../../shared/validation/index.js';
import type { IPassengerRepository } from '../domain/types.js';

export class PassengerHandlers {
  constructor(private readonly passengerRepository: IPassengerRepository) {}

  getProfiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const profiles = await this.passengerRepository.findByUserId(userId);
      res.status(200).json({ profiles });
    } catch (err) {
      next(err);
    }
  };

  saveProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const dto = SavePassengerProfileSchema.parse(req.body);
      const profile = await this.passengerRepository.create({ ...dto, userId });
      res.status(201).json({ profile });
    } catch (err) {
      next(err);
    }
  };

  deleteProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params as { id: string };
      await this.passengerRepository.delete(id, userId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
