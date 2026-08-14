import { Module } from '@nestjs/common';
import {
  DisciplinesController,
  RegistrationsController,
} from '../controllers/registrations.controller.js';
import {
  ParticipantIdentityLinksController,
  ParticipantsController,
} from '../controllers/participants.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    RegistrationsController,
    DisciplinesController,
    ParticipantsController,
    ParticipantIdentityLinksController,
  ],
})
export class RegistrationModule {}
