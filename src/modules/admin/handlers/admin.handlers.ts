import type { Request, Response, NextFunction } from 'express';
import { CreateFlightSchema, UpdateFlightSchema } from '../../../shared/validation/index.js';
import type { IFlightRepository } from '../../flight/domain/types.js';

export class AdminHandlers {
  constructor(private readonly flightRepository: IFlightRepository) {}

  listFlights = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Return all scheduled flights for admin view
      const flights = await this.flightRepository.findAvailable({
        origin: '',
        destination: '',
        departureDate: new Date().toISOString().slice(0, 10),
        passengers: 1,
      });
      res.status(200).json({ flights });
    } catch (err) {
      next(err);
    }
  };

  createFlight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = CreateFlightSchema.parse(req.body);
      const flight = await this.flightRepository.create({
        ...dto,
        departureAt: new Date(dto.departureAt),
        arrivalAt: new Date(dto.arrivalAt),
      });
      res.status(201).json({ flight });
    } catch (err) {
      next(err);
    }
  };

  updateFlight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const dto = UpdateFlightSchema.parse(req.body);
      const flight = await this.flightRepository.update(id, {
        ...dto,
        departureAt: dto.departureAt ? new Date(dto.departureAt) : undefined,
        arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : undefined,
      });
      res.status(200).json({ flight });
    } catch (err) {
      next(err);
    }
  };

  deactivateFlight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.flightRepository.deactivate(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
