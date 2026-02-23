# Oracle AIM 与 OUM 方法论：阶段与核心文档对照表

本文档整理 **Oracle AIM（Application Implementation Method）** 与 **Oracle OUM（Oracle Unified Method）** 的实施阶段，以及各阶段/流程下的核心文档编号与名称，便于查阅与裁剪使用。

---

## 阶段 × 阶段做什么 × 阶段产出文档（总表）

以下表格按「阶段 — 阶段做什么 — 该阶段产出的文档」一一对应列出，便于按阶段查阅与裁剪。

### Oracle AIM

| 阶段 | 阶段做什么 | 阶段产出文档 |
|------|------------|--------------|
| **1. 定义**（Definition） | 明确业务与流程策略、现状组织与运营结构、需求范围；确定项目工作计划和架构方向 | BP.010 业务与流程策略、BP.020 变更目录与分析、BP.040 现状流程模型、RD.010 财务与运营结构、RD.020 当前业务基线、RD.050 业务需求、TA.010 架构需求与策略 |
| **2. 运营分析**（Operations Analysis） | 分析现状与 Oracle 标准功能的差距，把业务需求与数据映射到系统，确定应用设置与架构方案 | RD.030 流程与映射摘要、RD.040 业务量与指标、BR.010 高层差距分析、BR.020 映射环境准备、BR.030 业务需求映射、BR.040 业务数据映射、BR.100 应用设置（BR100）、BR.110 安全配置文件、TA.030 初步概念架构、TA.040 应用架构 |
| **3. 设计**（Design） | 做集成与报表适配分析，输出扩展与功能设计、数据转换策略及文档策略 | BR.050 集成适配分析、BR.060 信息模型、BR.070 报表适配分析、MD.010 扩展策略、MD.030 设计标准、MD.050 功能设计（MD50）、MD.060 数据库扩展设计、CV.010 数据转换需求与策略、CV.040 转换数据映射、DO.010 文档需求与策略 |
| **4. 构建**（Build） | 将功能设计落实为技术设计并开发、做数据转换与单元/系统测试、编写用户文档 | MD.070 技术设计（MD70）、MD.080 功能与技术设计评审、MD.090 开发环境准备、MD.100 数据库扩展、MD.110 应用扩展模块、CV.060 转换程序设计、CV.080 转换程序开发、TE.010 测试需求与策略、TE.020 单元测试脚本、TE.040 系统测试脚本（TE40）、TE.060 测试环境、TE.070 单元测试、DO.060 用户参考手册、DO.070 用户指南 |
| **5. 转换**（Transition） | 执行系统测试、集成测试、验收测试与性能测试，开展培训与变革，准备生产环境并验证上线就绪 | TE.110 系统测试、TE.120 集成测试、TE.130 验收测试、PT.010 性能测试策略、PT.120 性能测试执行、AP.010 项目策略、AP.140 用户学习计划、AP.170 用户学习实施、PM.010 转换策略、PM.030 转换与应急计划、PM.040 生产环境准备、PM.070 生产就绪验证 |
| **6. 生产**（Production） | 正式上线、监控与维护、下线旧系统，规划后续业务与技术方向 | PM.080 正式上线（Go Live）、PM.090 系统性能测量、PM.100 系统维护、PM.120 下线原系统、PM.130 未来业务方向、PM.140 未来技术方向 |

### Oracle OUM

| 阶段 | 阶段做什么 | 阶段产出文档 |
|------|------------|--------------|
| **1. 先启**（Inception） | 确定项目愿景与范围、业务案例，做初版成本与进度估算，识别主要风险与候选架构 | 愿景文档、范围文档、术语表；RA.023 用例模型、RA.024 用例规格 |
| **2. 精化**（Elaboration） | 细化需求与架构，建立可执行架构基线，制定构建阶段详细计划与估算 | RA.180 已评审用例模型；细化需求、架构基线、构建阶段计划 |
| **3. 构建**（Construction） | 完成设计、开发、单元/集成测试与用户文档，交付可运行系统 | 设计规格、实现产物、测试用例/报告、用户文档 |
| **4. 移交**（Transition） | 部署到生产环境、UAT、用户培训与上线检查，达到可上线状态 | 部署清单、UAT 报告、培训材料、上线检查清单 |
| **5. 生产**（Production） | 正式上线后的支持、运维与持续改进，项目签收 | 运维手册、支持记录、改进建议、签收文档 |

---

## 一、Oracle AIM：六阶段与核心文档（详表）

AIM 采用 **流程（Process）** 与 **任务（Task）** 两层：流程用两字母前缀（如 BP、RD、BR），任务用三位数字（如 .010、.050）。文档编号格式：**前缀 + 数字**（如 BP.010、BR.100、MD.050）。

| 阶段 Phase | 主要涉及流程 | 文档编号 | 文档名称（英文） |
|-----------|--------------|----------|------------------|
| **1. Definition 定义** | BP, RD, TA | BP.010 | Define Business and Process Strategy |
| | | BP.020 | Catalog and Analyze Potential Changes |
| | | BP.040 | Develop Current Process Model |
| | | RD.010 | Identify Current Financial and Operating Structure |
| | | RD.020 | Conduct Current Business Baseline |
| | | RD.050 | Gather Business Requirements |
| | | TA.010 | Define Architecture Requirements and Strategy |
| **2. Operations Analysis 运营分析** | RD, BR, TA | RD.030 | Establish Process and Mapping Summary |
| | | RD.040 | Gather Business Volumes and Metrics |
| | | BR.010 | Analyze High-Level Gaps |
| | | BR.020 | Prepare mapping environment |
| | | BR.030 | Map Business requirements |
| | | BR.040 | Map Business Data |
| | | BR.100 | Define Applications Setup |
| | | BR.110 | Define security Profiles |
| | | TA.030 | Develop Preliminary Conceptual Architecture |
| | | TA.040 | Define Application Architecture |
| **3. Design 设计** | BR, MD, TA, CV, DO | BR.050 | Conduct Integration Fit Analysis |
| | | BR.060 | Create Information Model |
| | | BR.070 | Create Reporting Fit Analysis |
| | | MD.010 | Define Application Extension Strategy |
| | | MD.030 | Define design standards |
| | | **MD.050** | **Create Application extensions functional design**（功能设计，常称 MD50） |
| | | MD.060 | Design Database extensions |
| | | CV.010 | Define data conversion requirements and strategy |
| | | CV.040 | Perform conversion data mapping |
| | | DO.010 | Define documentation requirements and strategy |
| **4. Build 构建** | MD, CV, TE, DO, PT | **MD.070** | **Create Application extensions technical design**（技术设计，常称 MD70） |
| | | MD.080 | Review functional and Technical designs |
| | | MD.090 | Prepare Development environment |
| | | MD.100 | Create Database extensions |
| | | MD.110 | Create Application extension modules |
| | | CV.060 | Design conversion programs |
| | | CV.080 | Develop conversion programs |
| | | TE.010 | Define testing requirements and strategy |
| | | TE.020 | Develop unit test script |
| | | **TE.040** | **Develop system test script**（系统测试脚本，常称 TE40） |
| | | TE.060 | Prepare testing environments |
| | | TE.070 | Perform unit test |
| | | DO.060 | Publish user reference manual |
| | | DO.070 | Publish user guide |
| **5. Transition 转换** | TE, TR, AP, PM | TE.110 | Perform system test |
| | | TE.120 | Perform systems integration test |
| | | TE.130 | Perform Acceptance test |
| | | PT.010 | Define Performance Testing Strategy |
| | | PT.120 | Execute Performance Test |
| | | AP.010 | Define Executive Project Strategy |
| | | AP.140 | Develop User Learning Plan |
| | | AP.170 | Conduct User Learning Events |
| | | PM.010 | Define Transition Strategy |
| | | PM.030 | Develop Transition and Contingency Plan |
| | | PM.040 | Prepare Production Environment |
| | | PM.070 | Verify Production Readiness |
| **6. Production 生产/上线** | PM | **PM.080** | **Begin Production**（上线） |
| | | PM.090 | Measure System Performance |
| | | PM.100 | Maintain System |
| | | PM.120 | Decommission Former Systems |
| | | PM.130 | Propose Future Business Direction |
| | | PM.140 | Propose Future Technical Direction |

### AIM 流程（Process）与编号前缀一览

| 前缀 | 流程名称 | 典型文档示例 |
|------|----------|--------------|
| BP | Business Process Architecture | BP.010–BP.090 |
| RD | Business Requirements Definition | RD.010–RD.080 |
| BR | Business Requirements Mapping | BR.010–BR.110 |
| TA | Application and Technical Architecture | TA.010–TA.150 |
| MD | Module Design and Build | MD.010–MD.120 |
| CV | Data Conversion | CV.010–CV.130 |
| DO | Documentation | DO.010–DO.090 |
| TE | Business System Testing | TE.010–TE.130 |
| PT | Performance Testing | PT.010–PT.120 |
| AP | Adoption and Learning（原 TR 培训/变革） | AP.010–AP.180 |
| PM | Production Migration | PM.010–PM.140 |

---

## 二、Oracle OUM：五阶段与核心工作产品

OUM 以 **阶段（Phase）** 与 **里程碑** 为主，工作产品（Work Product）采用 **两字母前缀 + 数字**（如 RA.023、RA.024）。OUM 更偏目标驱动，文档清单因项目裁剪而异；下表为常见阶段与典型工作产品编号/名称。

| 阶段 Phase | 里程碑 Milestone | 典型工作产品编号 | 工作产品名称/说明 |
|-----------|------------------|------------------|-------------------|
| **1. Inception 先启** | Lifecycle Objective (LO) | （视项目裁剪） | 业务愿景、范围、业务案例、初版成本/进度估算 |
| | | RA.023 | Use Case Model（用例模型） |
| | | RA.024 | Use Case Specifications（用例规格） |
| | | — | Vision / Scope / Glossary 等 |
| **2. Elaboration 精化** | Lifecycle Architecture (LA) | RA.180 | Reviewed Use Case Model（已评审用例模型） |
| | | （需求/分析类） | 细化需求、可执行架构基线、Construction 详细计划 |
| **3. Construction 构建** | Initial Operating Capability (IOC) | （设计/实现类） | 设计、开发、单元/集成测试、用户文档 |
| **4. Transition 移交** | System Production (SP) | — | 部署、UAT、培训、上线检查清单 |
| **5. Production 生产** | Sign-off (SO) | — | 上线支持、运维、持续改进 |

说明：OUM 的完整任务/工作产品列表在 Oracle Method Pack 中维护（如 Implement & Manage 视图），公开资料中常见示例多为 **RA**（Requirements / Analysis）系列（如 RA.023、RA.024、RA.180），其他前缀（若存在）需以官方 Method Pack 为准。

---

## 三、AIM 与 OUM 对照摘要

| 维度 | Oracle AIM | Oracle OUM |
|------|------------|------------|
| 适用 | EBS 等 On-Premises ERP | Cloud + On-Premises，全生命周期 |
| 阶段数 | 6（Definition → Production） | 5（Inception → Production） |
| 文档体系 | 流程前缀 + 三位数（如 BR.100、MD.050、TE.040、PM.080） | 工作产品前缀 + 数字（如 RA.023、RA.180），按项目裁剪 |
| 特点 | 可交付物多（200+），重文档与流程 | 迭代/增量、目标与里程碑驱动，更灵活 |

---

## 四、常见文档俗称与编号速查

| 俗称/场景 | AIM 编号 | 含义 |
|-----------|----------|------|
| 业务需求/应用设置 | BR.100（BR100） | Define Applications Setup（按模块可有 BR100Aap、BR100Agl 等） |
| 功能设计 | MD.050（MD50） | Create Application extensions functional design |
| 技术设计 | MD.070（MD70） | Create Application extensions technical design |
| 数据转换（功能） | CV.040（CV40） | Perform conversion data mapping |
| 数据转换（技术） | CV.060（CV60） | Design conversion programs |
| 系统测试脚本 | TE.040（TE40） | Develop system test script |
| 上线 | PM.080（PM080） | Begin Production |

---

*整理自公开的 AIM 文档列表与 OUM 阶段/工作产品说明；OUM 完整清单以 Oracle 官方 Method Pack 为准。*
