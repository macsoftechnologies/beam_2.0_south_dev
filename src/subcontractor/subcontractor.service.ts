import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Subcontractor } from './entities/subcontractor.entity';
import { CreateSubcontractorDto, UpdateSubcontractorDto, SubcontractorPaginationQueryDto } from './dtos/subcontractor.dto';
import { FileUploadService } from './file-upload.service';
import { RedisCacheService } from 'src/redis/redid-cache.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SubcontractorService {
  constructor(
    @InjectRepository(Subcontractor)
    private subcontractorRepo: Repository<Subcontractor>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private fileUploadService: FileUploadService,
    private readonly redisCacheService: RedisCacheService,
  ) { }

  async create(createSubcontractorDto: CreateSubcontractorDto, logoFilename?: string) {
    try {
      const subcontractor = this.subcontractorRepo.create({
        ...createSubcontractorDto,
        departId: createSubcontractorDto.departId ?? 0,
        logo: logoFilename,
      });

      const result = await this.subcontractorRepo.save(subcontractor);
      if (result) {
        await this.redisCacheService.deleteByPattern('subcontractors:*');
        return {
          statusCode: HttpStatus.CREATED,
          message: 'SubContractor Created',
          data: result,
        };
      }
      return {
        statusCode: HttpStatus.EXPECTATION_FAILED,
        message: 'Failed to create subcontractor',
      };
    }
    catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async onModuleInit() {
    try {
      const existingNne = await this.subcontractorRepo.findOne({
        where: [{ subContractorName: 'NNE' }, { subContractorName: Like('%NNE%') }],
      });
      if (!existingNne) {
        const nne = this.subcontractorRepo.create({
          subContractorName: 'NNE',
          departId: 1,
        });
        await this.subcontractorRepo.save(nne);
      }
    } catch (err) {
      // Ignore seeding error
    }
  }

  async findAll(query: SubcontractorPaginationQueryDto, loggedInUserId?: number) {
    try {
      const { page = 1, limit = 10, isExport = false, search = "" } = query;

      let subContractorId: number | null = null;
      if (loggedInUserId) {
        const user = await this.userRepo.findOne({ where: { id: loggedInUserId } });
        if (user && user.userType === 'Subcontractor') {
          subContractorId = user.typeId;
        }
      }

      const cacheKey = subContractorId
        ? `subcontractors:list:${isExport}:${page}:${limit}:${search}:subcon:${subContractorId}:with_nne`
        : `subcontractors:list:${isExport}:${page}:${limit}:${search}`;

      return this.redisCacheService.getOrSet(
        cacheKey,
        async () => {
          const findOptions: any = {
            order: { subContractorName: 'ASC' },
          };
          if (subContractorId) {
            findOptions.where = [
              { id: subContractorId },
              { subContractorName: Like('%NNE%') },
            ];
          }
          if (search) {
            const searchFilter = { subContractorName: Like(`%${search}%`) };
            if (findOptions.where) {
              if (Array.isArray(findOptions.where)) {
                findOptions.where = findOptions.where.map(w => ({ ...w, ...searchFilter }));
              } else {
                findOptions.where = { ...findOptions.where, ...searchFilter };
              }
            } else {
              findOptions.where = searchFilter;
            }
          }
          if (!isExport) {
            findOptions.take = limit;
            findOptions.skip = (page - 1) * limit;
          }
          let [subcontractors, total] = await this.subcontractorRepo.findAndCount(findOptions);

          // If contractor user and NNE was not yet in DB, include NNE
          if (subContractorId) {
            const hasNne = subcontractors.some(s => (s.subContractorName || '').toUpperCase().trim().includes('NNE'));
            if (!hasNne) {
              const nneInDb = await this.subcontractorRepo.findOne({
                where: [{ subContractorName: 'NNE' }, { subContractorName: Like('%NNE%') }],
              });
              if (nneInDb) {
                subcontractors.push(nneInDb);
                total += 1;
              } else {
                const autoNne = this.subcontractorRepo.create({
                  subContractorName: 'NNE',
                  departId: 1,
                });
                const savedNne = await this.subcontractorRepo.save(autoNne).catch(() => null);
                if (savedNne) {
                  subcontractors.push(savedNne);
                  total += 1;
                }
              }
            }
          }

          if (total === 0) {
            return { statusCode: HttpStatus.NOT_FOUND, message: 'No SubContractors Found', data: [], total: 0 };
          }
          return {
            statusCode: HttpStatus.OK,
            message: 'SubContractors Found',
            data: subcontractors,
            total,
            page: isExport ? 1 : page,
            limit: isExport ? total : limit,
            totalPages: isExport ? 1 : Math.ceil(total / limit),
          };
        },
        1000 * 60 * 5,
      );
    }
    catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async findOne(id: number) {
    try {
      return this.redisCacheService.getOrSet(
        `subcontractors:detail:${id}`,
        async () => {
          const subcontractor = await this.subcontractorRepo.findOne({ where: { id } });
          if (!subcontractor) {
            return { statusCode: HttpStatus.NOT_FOUND, message: 'SubContractor not found' };
          }
          return {
            statusCode: HttpStatus.OK,
            message: 'SubContractor found',
            data: subcontractor,
          }
        },
        1000 * 60 * 10,
      );
    }
    catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async update(id: number, updateSubcontractorDto: UpdateSubcontractorDto, logoFilename?: string) {
    try {
      const existing: any = await this.findOne(id);
      if (existing.statusCode !== HttpStatus.OK) {
        return existing;
      }
      const updateData: any = { ...updateSubcontractorDto };
      if (logoFilename !== undefined) {
        // If a new logo is uploaded, delete the old logo from disk
        if (existing.data?.logo) {
          this.fileUploadService.deleteFile(existing.data.logo);
        }
        updateData.logo = logoFilename;
      }

      await this.subcontractorRepo.update(id, updateData);
      await this.redisCacheService.deleteByPattern('subcontractors:*');
      return await this.findOne(id);
    }
    catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async remove(id: number) {
    const subcontractor: any = await this.findOne(id);
    if (subcontractor.statusCode === HttpStatus.OK && subcontractor.data) {
      if (subcontractor.data.logo) {
        this.fileUploadService.deleteFile(subcontractor.data.logo);
      }
      await this.subcontractorRepo.delete(id);
      await this.redisCacheService.deleteByPattern('subcontractors:*');
    }
    return {
      statusCode: HttpStatus.OK,
      message: "Subcontractor deleted successfully",
      data: subcontractor.data
    };
  }
}
