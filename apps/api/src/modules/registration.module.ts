import { Module } from '@nestjs/common';
import { DisciplinesController } from '../controllers/disciplines.controller.js';
import { EntrantsController } from '../controllers/entrants.controller.js';
import { RegistrationsController } from '../controllers/registrations.controller.js';
import {
  ParticipantIdentityLinksController,
  ParticipantsController,
} from '../controllers/participants.controller.js';
import {
  ClubMediaController,
  PersonMediaController,
} from '../controllers/identity-media.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    RegistrationsController,
    EntrantsController,
    DisciplinesController,
    ParticipantsController,
    ParticipantIdentityLinksController,
    PersonMediaController,
    ClubMediaController,
  ],
})
export class RegistrationModule {}
