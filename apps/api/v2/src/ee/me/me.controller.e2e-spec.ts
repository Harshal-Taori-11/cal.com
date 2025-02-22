import { bootstrap } from "@/app";
import { AppModule } from "@/app.module";
import { SchedulesModule_2024_04_15 } from "@/ee/schedules/schedules_2024_04_15/schedules.module";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UpdateManagedUserInput } from "@/modules/users/inputs/update-managed-user.input";
import { UsersModule } from "@/modules/users/users.module";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { User, Team } from "@prisma/client";
import * as request from "supertest";
import { OrganizationRepositoryFixture } from "test/fixtures/repository/organization.repository.fixture";
import { ProfileRepositoryFixture } from "test/fixtures/repository/profiles.repository.fixture";
import { SchedulesRepositoryFixture } from "test/fixtures/repository/schedules.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { randomString } from "test/utils/randomString";
import { withApiAuth } from "test/utils/withApiAuth";

import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { UserResponse } from "@calcom/platform-types";
import { ApiSuccessResponse } from "@calcom/platform-types";

describe("Me Endpoints", () => {
  describe("User Authentication", () => {
    let app: INestApplication;

    let userRepositoryFixture: UserRepositoryFixture;
    let schedulesRepositoryFixture: SchedulesRepositoryFixture;
    let profilesRepositoryFixture: ProfileRepositoryFixture;
    let organizationsRepositoryFixture: OrganizationRepositoryFixture;
    const userEmail = `me-controller-user-${randomString()}@api.com`;
    let user: User;
    let org: Team;

    beforeAll(async () => {
      const moduleRef = await withApiAuth(
        userEmail,
        Test.createTestingModule({
          imports: [AppModule, PrismaModule, UsersModule, TokensModule, SchedulesModule_2024_04_15],
        })
      )
        .overrideGuard(PermissionsGuard)
        .useValue({
          canActivate: () => true,
        })
        .compile();

      userRepositoryFixture = new UserRepositoryFixture(moduleRef);
      organizationsRepositoryFixture = new OrganizationRepositoryFixture(moduleRef);
      profilesRepositoryFixture = new ProfileRepositoryFixture(moduleRef);

      schedulesRepositoryFixture = new SchedulesRepositoryFixture(moduleRef);

      user = await userRepositoryFixture.create({
        email: userEmail,
        username: userEmail,
      });

      org = await organizationsRepositoryFixture.create({
        name: `me-controller-organization-${randomString()}`,
        isOrganization: true,
        isPlatform: true,
      });

      await profilesRepositoryFixture.create({
        uid: "asd-asd",
        username: userEmail,
        user: { connect: { id: user.id } },
        organization: { connect: { id: org.id } },
        movedFromUser: { connect: { id: user.id } },
      });

      app = moduleRef.createNestApplication();
      bootstrap(app as NestExpressApplication);

      await app.init();
    });

    it("should be defined", () => {
      expect(userRepositoryFixture).toBeDefined();
      expect(user).toBeDefined();
    });

    it("should get user associated with access token", async () => {
      return request(app.getHttpServer())
        .get("/v2/me")
        .expect(200)
        .then((response) => {
          const responseBody: ApiSuccessResponse<UserResponse> = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);

          expect(responseBody.data.id).toEqual(user.id);
          expect(responseBody.data.email).toEqual(user.email);
          expect(responseBody.data.timeFormat).toEqual(user.timeFormat);
          expect(responseBody.data.defaultScheduleId).toEqual(user.defaultScheduleId);
          expect(responseBody.data.weekStart).toEqual(user.weekStart);
          expect(responseBody.data.timeZone).toEqual(user.timeZone);
          expect(responseBody.data.organization?.isPlatform).toEqual(true);
          expect(responseBody.data.organization?.id).toEqual(org.id);
        });
    });

    it("should update user associated with access token", async () => {
      const body: UpdateManagedUserInput = { timeZone: "Europe/Rome" };

      return request(app.getHttpServer())
        .patch("/v2/me")
        .send(body)
        .expect(200)
        .then(async (response) => {
          const responseBody: ApiSuccessResponse<UserResponse> = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);

          expect(responseBody.data.id).toEqual(user.id);
          expect(responseBody.data.email).toEqual(user.email);
          expect(responseBody.data.timeFormat).toEqual(user.timeFormat);
          expect(responseBody.data.defaultScheduleId).toEqual(user.defaultScheduleId);
          expect(responseBody.data.weekStart).toEqual(user.weekStart);
          expect(responseBody.data.timeZone).toEqual(body.timeZone);

          if (user.defaultScheduleId) {
            const defaultSchedule = await schedulesRepositoryFixture.getById(user.defaultScheduleId);
            expect(defaultSchedule?.timeZone).toEqual(body.timeZone);
          }
        });
    });

    it("should update user associated with access token given badly formatted timezone", async () => {
      const bodyWithBadlyFormattedTimeZone: UpdateManagedUserInput = { timeZone: "America/New_york" };

      return request(app.getHttpServer())
        .patch("/v2/me")
        .send(bodyWithBadlyFormattedTimeZone)
        .expect(200)
        .then(async (response) => {
          const responseBody: ApiSuccessResponse<UserResponse> = response.body;
          expect(responseBody.status).toEqual(SUCCESS_STATUS);

          expect(responseBody.data.timeZone).toEqual("America/New_York");
        });
    });

    it("should not update user associated with access token given invalid timezone", async () => {
      const bodyWithIncorrectTimeZone: UpdateManagedUserInput = { timeZone: "Narnia/Woods" };

      return request(app.getHttpServer()).patch("/v2/me").send(bodyWithIncorrectTimeZone).expect(400);
    });

    it("should not update user associated with access token given invalid time format", async () => {
      const bodyWithIncorrectTimeFormat: UpdateManagedUserInput = { timeFormat: 100 as any };

      return request(app.getHttpServer()).patch("/v2/me").send(bodyWithIncorrectTimeFormat).expect(400);
    });

    it("should not update user associated with access token given invalid week start", async () => {
      const bodyWithIncorrectWeekStart: UpdateManagedUserInput = { weekStart: "waba luba dub dub" as any };

      return request(app.getHttpServer()).patch("/v2/me").send(bodyWithIncorrectWeekStart).expect(400);
    });

    afterAll(async () => {
      await userRepositoryFixture.deleteByEmail(user.email);
      await organizationsRepositoryFixture.delete(org.id);
      await app.close();
    });
  });
});
