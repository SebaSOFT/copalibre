import { Module } from '@nestjs/common';
import {
  DisciplinesController,
  EntrantsController,
  RegistrationsController,
} from '../controllers/registrations.controller.js';
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
