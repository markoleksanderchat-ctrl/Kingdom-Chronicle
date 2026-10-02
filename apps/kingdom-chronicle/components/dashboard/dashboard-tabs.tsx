import { memo } from "react";
import {
  buildingGroup, buildingPeopleIds, buildingName, buildingState, citizenStatus, formatNumber,
  formatSnapshotTime, identifierName, roleName,
} from "@/lib/colony";
import type { DashboardModel } from "@/lib/dashboard-model";
import {
  citizenAttentionReason, citizenTreatmentCondition,
  constructionCompletionPercent as completionPercent,
  constructionName as projectName, requestStateLabel,
} from "@/lib/selectors/presentation";
import { statisticLabels as statLabels } from "@/lib/selectors/statistics";
import { foodRunoutCopy, foodRunwayLabel, foodStatusLabel } from "@/lib/food";
import { MinecraftItemIcon, ResourceRow } from "./minecraft-item-icon";
import { InventoryList } from "./inventory-list";
import { ChronicleGlyph } from "./chronicle-glyph";
import { Meter, PhaseTracker } from "./shared-ui";

const wording = {
  noRequests: "No active requests.",
  noConstruction: "No building work underway.",
  noWorker: "No worker assigned",
  unavailable: "Unavailable",
} as const;

interface TabProps {
  model: DashboardModel;
  active: boolean;
  desktopMode: boolean;
}

export const OverviewTab = memo(function OverviewTab({ model, active, desktopMode }: TabProps) {
  const {
    colony, structurePack, centerBiome, construction, requests, raidReadiness, capacityPercent,
    raidStatusKnown, worldStatus, worldAgeDays, colonyDay, summary, lowMorale, activeWorkplaces,
    hasAttention, foodSupply, raidActive, lowMoraleHighlights, lowMoraleDelta, employmentPercent,
    citizens, unhealthy, citizenById, foodReserveDelta, foodRunwayDelta, topFoods, menuFoods,
    missingMenuFoods, happinessDelta,
  } = model;
  const visibleFoods = topFoods.slice(0, 6);
  return (
      <div id="panel-overview" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-overview"} aria-label={desktopMode ? "Overview" : undefined} tabIndex={0} hidden={!active}>
        <section className="intro" aria-labelledby="realm-heading">
          <div>
            <p className="kicker">Colony status · MineColonies</p>
            <h2 id="realm-heading">{colony.name ?? "Your colony"}</h2>
            <p className="colony-metadata">{structurePack} · {centerBiome} · Colony Day {colonyDay ?? "unknown"}</p>
            <strong className="colony-condition">{raidActive ? "Under attack" : hasAttention ? "Needs attention" : "Stable & Productive"}</strong>
            <p>
              {summary.citizenCount} citizens · {construction.length} projects ·{" "}
              {requests.length} open requests ·{" "}
              {raidReadiness.totalGuards === 0 ? "Guards are needed." : capacityPercent != null && capacityPercent >= 100 ? "More housing is needed." : raidStatusKnown ? "The colony is peaceful." : "Raid status is unavailable."}
            </p>
          </div>
          <aside>
            <span>Last report</span>
            <strong>{worldStatus}</strong>
            <small>World day {worldAgeDays ?? "unknown"}</small>
            <small>Last report: {formatSnapshotTime(model.snapshot.generatedAt)}</small>
          </aside>
        </section>

        <section className="metric-row" aria-label="Primary colony metrics">
          <article><i className="metric-icon"><ChronicleGlyph icon="citizens" /></i><span>Citizens</span><strong>{summary.citizenCount} / {summary.citizenCapacity ?? "?"}</strong><small>{capacityPercent == null ? wording.unavailable : `${formatNumber(capacityPercent)}% full`}</small></article>
          <article><i className="metric-icon"><ChronicleGlyph icon="heart" /></i><span>Happiness</span><strong>{formatNumber(colony.overallHappiness, 1)}</strong><small>{lowMorale.length} below 6.0{happinessDelta ? ` · ${happinessDelta}` : ""}</small></article>
          <article><i className="metric-icon"><ChronicleGlyph icon="projects" /></i><span>Workers</span><strong>{summary.employedCitizens} / {summary.citizenCount}</strong><small>{summary.unemployedCitizens} without work</small></article>
          <article><i className="metric-icon"><ChronicleGlyph icon="buildings" /></i><span>Buildings</span><strong>{summary.buildingCount}</strong><small>{activeWorkplaces} active workplaces</small></article>
          <article><i className="metric-icon"><ChronicleGlyph icon="projects" /></i><span>Projects</span><strong>{summary.activeConstructionProjects}</strong><small>{construction.length ? "Underway" : "None"}</small></article>
          <article><i className="metric-icon"><ChronicleGlyph icon="records" /></i><span>Requests</span><strong>{summary.activeRequests}</strong><small>{requests[0]?.details.display ? String(requests[0].details.display) : "None"}</small></article>
        </section>

        {hasAttention && <section className="alerts" aria-label="Needs attention">
          <strong>Needs attention</strong>
          {capacityPercent != null && capacityPercent >= 100 && <span className="critical">Housing full</span>}
          {raidReadiness.totalGuards === 0 && <span className="critical">Guards needed</span>}
          {lowMorale.length > 0 && <span>{lowMorale.length} citizen{lowMorale.length === 1 ? "" : "s"} below 6 happiness</span>}
          {summary.unemployedCitizens > 0 && <span>{summary.unemployedCitizens} citizen{summary.unemployedCitizens === 1 ? "" : "s"} without work</span>}
          {foodSupply && ["critical", "low", "watch"].includes(foodSupply.status) && <span className={foodSupply.status === "critical" ? "critical" : ""}>{foodStatusLabel(foodSupply.status)}</span>}
          {raidActive && <span className="critical">Raid active</span>}
        </section>}

        {lowMorale.length > 0 && <section className="attention-strip" aria-labelledby="attention-heading">
          <div><h2 id="attention-heading">Lowest happiness</h2></div>
          <div className="attention-citizens">
            {lowMoraleHighlights.map((citizen, index) => <article key={citizen.id ?? citizen.name ?? index}>
              <strong>{citizen.name}</strong><span>{roleName(citizen)}</span><b>{formatNumber(citizen.happiness, 1)} / 10</b><small>{citizenStatus(citizen)}</small>
            </article>)}
          </div>
          {lowMoraleDelta && <p className="trend-note">{lowMoraleDelta} since the last report.</p>}
        </section>}

        <div className="panel-grid overview-grid">
          <section className="side-section" aria-labelledby="health-heading">
            <h2 id="health-heading">Colony health</h2>
            <div className="health-list">
              <div><span>Employment</span><strong>{formatNumber(employmentPercent)}%</strong><Meter value={summary.employedCitizens} max={Math.max(1, summary.citizenCount)} label="Employment" /></div>
              <div><span>Housing</span><strong>{capacityPercent == null ? "Unknown" : `${formatNumber(capacityPercent)}%`}</strong>{capacityPercent != null && <Meter value={summary.citizenCount} max={summary.citizenCapacity!} warn={capacityPercent >= 100} label="Housing capacity" />}</div>
              <div><span>Staffed workplaces</span><strong>{activeWorkplaces}</strong></div>
              <div><span>Citizen health</span><strong>{citizens.length - unhealthy.length} healthy</strong><Meter value={citizens.length - unhealthy.length} max={Math.max(1, citizens.length)} label="Healthy citizens" /></div>
            </div>
          </section>

          <section className="side-section" aria-labelledby="requests-heading">
            <h2 id="requests-heading">Supply requests</h2>
            <div className="requests-list">
              {requests.map((request, index) => {
                const requester = request.requestingCitizenId == null ? undefined : citizenById.get(request.requestingCitizenId);
                const item = request.requestedItemDisplayName ?? String(request.details.display ?? request.details.description ?? identifierName(request.requestedItemRegistryId));
                return <article className="request" key={request.id ?? `${request.requestingCitizenId ?? "colony"}-${request.requestedItemRegistryId ?? "item"}-${index}`}>
                  <MinecraftItemIcon registryId={request.requestedItemRegistryId} displayName={item} size={32} />
                  <div className="request-copy"><strong>{item}</strong><p>{requester?.name ?? "Colony request"}{requester ? ` · ${roleName(requester)}` : ""}</p><small>{request.requestedQuantity ?? "?"} requested · {request.remainingQuantity != null && request.remainingQuantity <= 0 ? "Supplied" : `${request.remainingQuantity ?? "?"} remaining`}</small></div>
                  <span className="request-state">{requestStateLabel(request.state, request.remainingQuantity)}</span>
                </article>;
              })}
              {requests.length === 0 && <p className="empty-state success-state">{wording.noRequests}</p>}
            </div>
          </section>

          <section className={`side-section panel-span food-section ${foodSupply?.status ?? "learning"}`} aria-labelledby="food-heading">
            <div className="section-title food-title"><div><h2 id="food-heading">Food supply</h2></div>{foodSupply && <span>{foodStatusLabel(foodSupply.status)}</span>}</div>
            {foodSupply ? <>
              <div className="food-runway">
                  <div><span>Estimated reserve</span><strong>{foodRunwayLabel(foodSupply)}</strong><p>{foodRunoutCopy(foodSupply)}</p></div>
                <dl>
                  <div><dt>Meals stored</dt><dd>{formatNumber(foodSupply.storedServings)}</dd></div>
                  <div><dt>Average use</dt><dd>{foodSupply.averageMealsPerDay == null ? "Learning" : `${formatNumber(foodSupply.averageMealsPerDay, 1)} / day`}</dd></div>
                  <div><dt>Menu foods</dt><dd>{formatNumber(foodSupply.menuApprovedFoodTypes)}</dd></div>
                  <div><dt>Dining Halls</dt><dd>{formatNumber(foodSupply.diningHallsScanned)} checked</dd></div>
                </dl>
              </div>
                {(foodReserveDelta || foodRunwayDelta) && <p className="trend-note food-trend">Since last report: food {foodReserveDelta ?? "No change"}; days remaining {foodRunwayDelta ?? "No change"}.</p>}
              <div className="food-detail">
                <div><h3>Menu food on hand</h3>{visibleFoods.length ? <ul>{visibleFoods.map(([item, count]) => <li key={item}><ResourceRow item={item} count={count} label={identifierName(item)} /></li>)}</ul> : <p className="muted">None of the foods selected on the Dining Hall menu were found in colony building storage.</p>}{topFoods.length > visibleFoods.length && <details className="section-disclosure"><summary>More food on hand ({topFoods.length - visibleFoods.length})</summary><ul>{topFoods.slice(visibleFoods.length).map(([item, count]) => <li key={item}><ResourceRow item={item} count={count} label={identifierName(item)} /></li>)}</ul></details>}</div>
                <details className="section-disclosure"><summary>Dining Hall menu ({menuFoods.length})</summary>{menuFoods.length ? <ul>{menuFoods.map((item) => <li key={item}><MinecraftItemIcon registryId={item} displayName={identifierName(item)} size={24} /><span>{identifierName(item)}</span><strong>Included</strong></li>)}</ul> : <p className="empty-state">No menu foods selected.</p>}</details>
                {missingMenuFoods.length > 0 && <div className="menu-gap"><h3>Approved but out of stock</h3><div className="food-missing" role="list">{missingMenuFoods.map((item) => <ResourceRow key={item} item={item} count={0} label={identifierName(item)} note="OUT OF STOCK" dimmed />)}</div></div>}
                <p className="food-note">Counts menu-approved food in colony storage. The estimate uses {formatNumber(foodSupply.mealsServedSample)} meals over {foodSupply.sampleDays} completed days and assumes no new food is added. {foodSupply.truncated ? "The true reserve may be higher." : `${foodSupply.scannedBuildings} buildings checked.`}</p>
              </div>
            </> : <p className="empty-state">Food estimate unavailable.</p>}
          </section>
        </div>
      </div>
  );
});

export const ProjectsTab = memo(function ProjectsTab({ model, active, desktopMode }: TabProps) {
  const { snapshot, construction, citizenById, reconciledBuildings, structurePack, requests } = model;
  return (
      <div id="panel-projects" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-projects"} aria-label={desktopMode ? "Construction" : undefined} tabIndex={0} hidden={!active}>
        <section className="section" aria-labelledby="construction-heading">
          <div className="section-title"><div><h2 id="construction-heading">Building progress</h2></div><span>{construction.length} active</span></div>
          {snapshot.construction.length > 0 && snapshot.capabilities.constructionMaterials?.supported === false && <p className="capability-note"><strong>Materials unavailable here.</strong> Check the Builder&apos;s Hut for what is missing.</p>}
          <div className="build-grid">
            {construction.map((project, index) => {
              const builder = project.assignedBuilderCitizenId == null ? undefined : citizenById.get(project.assignedBuilderCitizenId);
              const workOrder = project.details.workOrderId;
              const rotation = String(project.details.rotationMirror ?? "NONE");
              const rotationLabel = rotation === "NONE" ? "Default" : `${rotation.replace(/^R/, "")}°`;
              const completion = completionPercent(project);
              const removal = project.projectType?.toLowerCase() === "remove";
              const task = identifierName(project.projectState?.toLowerCase());
              const builderRequests = requests.filter((request) => request.requestingCitizenId != null && request.requestingCitizenId === project.assignedBuilderCitizenId && (request.remainingQuantity ?? 0) > 0);
              return (
                <article className="build-card" key={`${project.buildingId}-${workOrder ?? index}`}>
                  <div className="build-head">
                    <span className="block-icon"><MinecraftItemIcon registryId={reconciledBuildings.find((building) => building.id === project.buildingId)?.registryId} displayName={projectName(project)} size={32} fallback="building" /></span>
                    <div><h3>{projectName(project)}</h3><p>Level {project.currentLevel ?? "?"}{removal ? " · Removal" : ` → ${project.targetLevel ?? "?"}`}</p></div>
                    <b>{removal ? "Removal order" : "Under construction"}</b>
                  </div>
                  <div className="phase"><span>Builder</span><strong>{builder?.name ?? wording.noWorker}</strong></div>
                  <div className="build-progress">
                    <div><span>Progress</span><strong>{completion == null ? "Waiting" : `${completion}%`}</strong></div>
                    {completion == null
                      ? <small>Updates shortly.</small>
                      : <Meter value={completion} max={100} label={`${projectName(project)} Builder's Hut completion`} />}
                  </div>
                  <div className="build-task"><span>Current task</span><strong>{task}</strong></div>
                  {!removal && <div className="builder-materials"><h4>Builder requests</h4>{builderRequests.length ? <div role="list">{builderRequests.map((request, index) => <ResourceRow key={request.id ?? index} item={request.requestedItemRegistryId ?? ""} count={request.remainingQuantity!} label={request.requestedItemDisplayName ?? identifierName(request.requestedItemRegistryId)} note="remaining" />)}</div> : <p className="muted">No open builder requests reported.</p>}<small>{typeof project.details.remainingRequiredResources === "number" ? `${formatNumber(project.details.remainingRequiredResources)} material units remaining` : "Material quantities unavailable"}</small></div>}
                  <details className="section-disclosure"><summary>Project information</summary>
                  {!removal && <PhaseTracker project={project} />}
                  <dl>
                    <div><dt>Work order</dt><dd>#{String(workOrder ?? "?")}</dd></div>
                    <div><dt>Builder&apos;s Hut</dt><dd>Level {reconciledBuildings.find((item) => item.id === project.builderHutId)?.level ?? "?"}</dd></div>
                    <div><dt>Rotation</dt><dd>{rotationLabel}</dd></div>
                    <div><dt>Style</dt><dd>{String(project.details.structurePack ?? structurePack)}</dd></div>
                  </dl>
                  </details>
                </article>
              );
            })}
            {construction.length === 0 && <p className="empty-state success-state">{wording.noConstruction}</p>}
          </div>
        </section>
      </div>
  );
});

export const CitizensTab = memo(function CitizensTab({ model, active, desktopMode }: TabProps) {
  const { citizens, visibleCitizens, needsTreatment, hospitalized, outsideHospitalCount, reconciledBuildings } = model;
  return (
      <div id="panel-citizens" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-citizens"} aria-label={desktopMode ? "Citizens" : undefined} tabIndex={0} hidden={!active}>
        <section className="section" aria-labelledby="population-heading">
          <div className="section-title"><div><h2 id="population-heading">Citizens</h2></div><span>{citizens.length}</span></div>
          {model.attentionCitizens.length > 0 && <p className="context">{model.attentionCitizens.length} may need attention · shown first in the full roster.</p>}
          <div className="table-wrap">
            <table>
              <caption>Citizen wellbeing</caption>
              <thead><tr><th scope="col">Citizen</th><th scope="col">Role</th><th scope="col">Home</th><th scope="col">Health</th><th scope="col">Status</th><th scope="col">Happiness</th><th scope="col">Saturation</th></tr></thead>
              <tbody>
                {visibleCitizens.map((citizen) => (
                  <tr key={citizen.id ?? citizen.name}>
                    <td data-label="Citizen"><strong>{citizen.name ?? `Citizen ${citizen.id}`}</strong>{(citizen.sick || citizen.injured) && <small className="health-flag">Needs care</small>}{citizenAttentionReason(citizen) !== citizenStatus(citizen) && <small className="attention-reason">{citizenAttentionReason(citizen)}</small>}</td>
                    <td data-label="Role">{roleName(citizen)}</td>
                    <td data-label="Home">{citizen.homeBuildingId ? (reconciledBuildings.filter((building) => building.id === citizen.homeBuildingId).map(buildingName).join("") || "Unreported") : "Unreported"}</td><td data-label="Health">{citizen.sick || citizen.injured ? "Needs care" : citizen.sick === false && citizen.injured === false ? "Healthy" : "Unknown"}</td><td data-label="Status">{citizenStatus(citizen)}</td>
                    <td data-label="Happiness"><div className="value-meter"><span>{formatNumber(citizen.happiness, 1)}</span><Meter value={citizen.happiness ?? 0} max={10} warn={(citizen.happiness ?? 10) < 6} label={`${citizen.name} happiness`} /></div></td>
                    <td data-label="Saturation">{formatNumber(citizen.saturation, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleCitizens.length === 0 && <p className="empty-state success-state">No citizens reported.</p>}
          </div>
        </section>
        <section className="side-section care-section" aria-labelledby="medical-heading">
          <div className="section-title">
            <div><h2 id="medical-heading">Medical care</h2></div>
            <span>{needsTreatment.length ? `${needsTreatment.length} need care` : "All clear"}</span>
          </div>
          <div className="care-summary" aria-label="Medical care summary">
            <div><strong>{needsTreatment.length}</strong><span>Need treatment</span></div>
            <div><strong>{hospitalized.length}</strong><span>At hospital</span></div>
            <div><strong>{outsideHospitalCount}</strong><span>Outside hospital</span></div>
          </div>
          {needsTreatment.length > 0 ? (
            <ul className="status-list">
              {needsTreatment.map((citizen) => {
                const hospitalState = citizen.details.hospitalized;
                const condition = citizenTreatmentCondition(citizen);
                return <li key={citizen.id ?? citizen.name}><span><strong>{citizen.name ?? `Citizen ${citizen.id}`}</strong><small>{condition}</small></span><b className={hospitalState === false ? "needs" : ""}>{hospitalState === true ? "At hospital" : hospitalState === false ? "Needs care" : "Location unavailable"}</b></li>;
              })}
            </ul>
          ) : <p className="empty-state success-state">No sick or injured citizens.</p>}
        </section>
      </div>
  );
});

export const BuildingsTab = memo(function BuildingsTab({ model, active, desktopMode }: TabProps) {
  const { reconciledBuildings, visibleBuildings, buildingCounts, citizenById } = model;
  return (
      <div id="panel-buildings" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-buildings"} aria-label={desktopMode ? "Buildings" : undefined} tabIndex={0} hidden={!active}>
        <section className="section" aria-labelledby="buildings-heading">
          <div className="section-title"><div><h2 id="buildings-heading">Buildings</h2></div><span>{reconciledBuildings.length}</span></div>
          <div className="building-summary">
            <div><strong>{buildingCounts.housing}</strong><span>Housing</span></div>
            <div><strong>{buildingCounts.couriers}</strong><span>Couriers</span></div>
            <div><strong>{buildingCounts.builders}</strong><span>Builders</span></div>
            <div><strong>{buildingCounts.attention}</strong><span>Needs attention</span></div>
          </div>
          <div className="building-list">
            {visibleBuildings.map((building, index) => {
              const state = buildingState(building);
              const name = buildingName(building);
              return (
                <article key={building.id ?? `${name}-${index}`} data-building>
                  <span className="mini-block"><MinecraftItemIcon registryId={building.registryId} displayName={name} fallback="building" /></span>
                  <div><strong>{name}</strong><small>{buildingGroup(building)}</small>{buildingPeopleIds(building).length > 0 && <small>{buildingPeopleIds(building).map((id) => citizenById.get(id)?.name ?? `Citizen ${id}`).join(", ")}</small>}</div>
                  <b>Lv. {building.level ?? "?"}</b>
                  <em className={["Unstaffed", "Unbuilt"].includes(state) ? "needs" : ""}>{state}</em>
                </article>
              );
            })}
            {visibleBuildings.length === 0 && <p className="empty-state success-state">No buildings reported.</p>}
          </div>
        </section>
      </div>
  );
});

export const RealmTab = memo(function RealmTab({ model, active, desktopMode }: TabProps) {
  const {
    completedResearch, research, researchBenefits, centerBiome, nearbyBiomes, environment, worldAgeDays,
    colonyDay, managedChunks, territory, raidActive, raidStatusKnown, raidReadiness, raidExpectedTonight,
    raidForecast, expectedRaiderCount, colony, defenseStatistics, defenseCoverage, defensiveKillsByEntity,
    livestock, livestockHuts,
  } = model;
  return (
      <div id="panel-realm" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-realm"} aria-label={desktopMode ? "Realm" : undefined} tabIndex={0} hidden={!active}>
        <div className="panel-grid">
          <section className="side-section knowledge-section" aria-labelledby="research-heading">
            <h2 id="research-heading">Research</h2>
            <p className="muted">{completedResearch.length} completed · {research.inProgress.length} in progress</p>
            <details className="section-disclosure"><summary>Completed research ({completedResearch.length})</summary>{completedResearch.length ? <ul className="research">{completedResearch.map((item, index) => <li key={`${item}-${index}`}><span aria-hidden="true">✓</span>{item}</li>)}</ul> : <p className="empty-state">No completed research reported.</p>}</details>
            <div className="subsection-heading"><h3>Active benefits</h3></div>
            {researchBenefits.length > 0 ? <ul className="benefit-list">{researchBenefits.map(({ id, summary }) =>
              <li key={id}><span><strong>{summary.title}</strong><small>{summary.description}</small></span><b>{summary.value}</b></li>)}</ul>
              : <p className="empty-state">No active research benefits.</p>}
          </section>

          <section className="side-section environment-section" aria-labelledby="environment-heading">
            <h2 id="environment-heading">Colony lands</h2>
            <dl className="facts">
              <div><dt>Center biome</dt><dd>{centerBiome}</dd></div>
              <div><dt>Nearby biomes</dt><dd>{nearbyBiomes.map(identifierName).join(" · ") || "None sampled"}</dd></div>
              <div><dt>Weather</dt><dd>{environment.thundering === true ? "Thunderstorm" : environment.raining === true ? "Rain" : environment.thundering === false && environment.raining === false ? "Clear" : "Unknown"}</dd></div>
              <div><dt>World day</dt><dd>{worldAgeDays ?? "Unknown"}</dd></div>
              <div><dt>Colony day</dt><dd>{colonyDay ?? "Unknown"}</dd></div>
              <div><dt>Claimed land</dt><dd>{managedChunks ?? "Unknown"} chunks</dd></div>
              <div><dt>Land in view</dt><dd>{territory.loadedChunks ?? "Unknown"} chunks</dd></div>
              <div><dt>Raid status</dt><dd>{raidActive ? "Active" : raidStatusKnown ? "Peaceful" : "Unknown"}</dd></div>
            </dl>
          </section>

          <section className={`side-section raid-section readiness-${raidReadiness.tone}`} aria-labelledby="raid-heading">
            <h2 id="raid-heading">Raid readiness</h2>
            <div className={`forecast-banner ${raidActive || raidExpectedTonight ? "danger" : ""}`}><strong>{raidForecast}</strong><span>{expectedRaiderCount == null ? "Raid size unavailable" : `${formatNumber(expectedRaiderCount)} estimated raider${expectedRaiderCount === 1 ? "" : "s"}`}</span></div>
            <div className="readiness-score">
              <div><span>Guard strength</span><strong>{raidReadiness.label}</strong><small>{raidReadiness.score == null ? "No active raid risk" : `${raidReadiness.score} / 100 planning score`}</small></div>
              {raidReadiness.score != null && <Meter value={raidReadiness.score} max={100} warn={raidReadiness.score < 60} label="Raid readiness planning score" />}
            </div>
            <dl className="facts readiness-facts">
              <div><dt>Guard coverage</dt><dd>{formatNumber(raidReadiness.availableGuards)} of {formatNumber(raidReadiness.recommendedGuards)} recommended</dd></div>
              <div><dt>Current threat</dt><dd>{raidReadiness.expectedRaiders == null ? wording.unavailable : `${formatNumber(raidReadiness.availableGuards)} guard${raidReadiness.availableGuards === 1 ? "" : "s"} vs ${formatNumber(raidReadiness.expectedRaiders)} raider${raidReadiness.expectedRaiders === 1 ? "" : "s"}`}</dd></div>
              <div><dt>Available guards</dt><dd>{raidReadiness.totalGuards === 0 ? "None" : `${formatNumber(raidReadiness.availableGuards)} of ${formatNumber(raidReadiness.totalGuards)}`}</dd></div>
              <div><dt>Recovery support</dt><dd>{raidReadiness.medicalStatus}</dd></div>
              <div><dt>Population baseline</dt><dd>1 per 5 citizens · {raidReadiness.populationBaseline} guards</dd></div>
              <div><dt>Defensive posts</dt><dd>{raidReadiness.staffedDefensivePosts} of {raidReadiness.defensivePosts} staffed</dd></div>
              <div><dt>Estimate confidence</dt><dd title={raidReadiness.confidenceDetail}>{raidReadiness.confidence}</dd></div>
              <div><dt>Nights since raid</dt><dd>{typeof colony.flags.nightsSinceLastRaid === "number" ? formatNumber(colony.flags.nightsSinceLastRaid) : "Unknown"}</dd></div>
            </dl>
            <ul className="readiness-actions">{raidReadiness.actions.map((action) => <li key={action}>{action}</li>)}</ul>
            <p className="readiness-note">Planning guide only: one available guard per five citizens, or enough to match the estimated raid. Equipment, levels, terrain, and positioning are not included.</p>
          </section>

          {defenseStatistics && <section className="side-section defense-record-section" aria-labelledby="defense-record-heading">
            <h2 id="defense-record-heading">Defense record</h2>
            <div className="defense-total"><span>Guard and Ranger kills</span><strong>{formatNumber(defenseStatistics.lifetime.total)}</strong><small>{formatNumber(defenseStatistics.today.total)} today · {formatNumber(defenseStatistics.recentWindow.total)} over {defenseStatistics.windowDays} days</small><b className={defenseStatistics.lifetime.reconciled === false ? "partial" : "exact"}>{defenseStatistics.lifetime.reconciled === false ? `${formatNumber(defenseCoverage, 1)}% identified` : "All identified"}</b></div>
            <div className="defense-breakdown">
              <div><span>MineColonies raiders</span><strong>{formatNumber(defenseStatistics.lifetime.raiders)}</strong></div>
              <div><span>Hostile creatures</span><strong>{formatNumber(defenseStatistics.lifetime.hostile)}</strong></div>
              <div><span>Other creatures</span><strong>{formatNumber(defenseStatistics.lifetime.peacefulOrOther)}</strong></div>
              <div><span>Unclassified</span><strong>{formatNumber(defenseStatistics.lifetime.unclassified)}</strong></div>
            </div>
            <div className="production-kills"><span>Animals butchered</span><strong>{formatNumber(defenseStatistics.animalsButchered)}</strong><small>{formatNumber(defenseStatistics.animalsButcheredToday)} today · {formatNumber(defenseStatistics.animalsButcheredRecentWindow)} over {defenseStatistics.windowDays} days</small></div>
            {defensiveKillsByEntity.length > 0 && <details className="section-disclosure"><summary>Creature breakdown ({defensiveKillsByEntity.length})</summary><ul className="defense-entities">{defensiveKillsByEntity.map(([entity, count]) => {
              const category = defenseStatistics.lifetime.byEntityCategory?.[entity];
              const categoryLabel = category === "minecolonies_raider" ? "MineColonies raider" : category === "monster_or_hostile" ? "Monster / hostile" : category === "neutral_or_peaceful" ? "Neutral / peaceful" : "Unclassified";
              return <li key={entity}><span>{identifierName(entity)}<small>{categoryLabel}</small></span><strong>{formatNumber(count)}</strong></li>;
            })}</ul></details>}
            <p className="readiness-note">Counts final blows by Knights and Rangers. Player kills are excluded.</p>
          </section>}

          <section className="side-section livestock-section" aria-labelledby="livestock-heading">
            <h2 id="livestock-heading">Livestock</h2>
            {livestock?.huts && livestockHuts.length > 0 ? <><div className="care-summary livestock-summary"><div><strong>{formatNumber(livestock.total)}</strong><span>Tended animals</span></div><div><strong>{formatNumber(livestockHuts.length)}</strong><span>Active huts</span></div></div><ul className="livestock-huts">{livestockHuts.map((hut) => <li key={hut.buildingId}><div className="livestock-hut-heading"><div><strong>{hut.name || identifierName(hut.buildingType)}</strong><small>{hut.position ? `X ${formatNumber(hut.position.x)} · Y ${formatNumber(hut.position.y)} · Z ${formatNumber(hut.position.z)}` : hut.buildingId}</small></div><b>{formatNumber(hut.total)} animal{hut.total === 1 ? "" : "s"}</b></div><div className="livestock-hut-meta">{formatNumber(hut.workerIds.length)} assigned worker{hut.workerIds.length === 1 ? "" : "s"}</div><ul className="livestock-list">{hut.sortedByType.map(([type, count]) => <li key={type}><span>{identifierName(type)}</span><strong>{formatNumber(count)}</strong></li>)}</ul></li>)}</ul></>
              : livestock?.huts ? <p className="empty-state success-state">No animals at staffed huts.</p>
              : <p className="empty-state">Livestock unavailable.</p>}
          </section>
        </div>
      </div>
  );
});

export const RecordsTab = memo(function RecordsTab({
  model, active, desktopMode, stockQuery, onStockQueryChange, receivedAt, observedAt,
}: TabProps & {
  stockQuery: string;
  onStockQueryChange: (value: string) => void;
  receivedAt: string | null;
  observedAt: string | null;
}) {
  const {
    stockLedger, stockTotalDelta, stockCoverageChanged,
    recentStatistics, visibleRecentKeys, mealWindowDifference,
    visibleStats, snapshot, availableCapabilities, totalCapabilities, unsupportedCapabilities,
  } = model;
  return (
      <div id="panel-records" className="tab-panel" role="tabpanel" aria-labelledby={desktopMode ? undefined : "tab-records"} aria-label={desktopMode ? "Ledger" : undefined} tabIndex={0} hidden={!active}>
        <div className="panel-grid records-grid">
          <section className="side-section panel-span stock-section" aria-labelledby="stock-heading">
            <div className="section-title"><div><h2 id="stock-heading">Storage</h2></div>{stockLedger && <span>{formatNumber(stockLedger.distinctItemTypes)} item types</span>}</div>
            {stockLedger ? <>
              <div className="stock-summary">
                <div><span>Total items</span><strong>{formatNumber(stockLedger.totalItems)}</strong>{stockTotalDelta && <small>{stockTotalDelta} since last count</small>}</div>
                <div><span>Counted</span><strong>{stockLedger.refreshedColonyDay == null ? "Unknown" : `Day ${formatNumber(stockLedger.refreshedColonyDay)}`}</strong></div>
                <div><span>Next count</span><strong>{stockLedger.nextRefreshColonyDay == null ? "Unknown" : `Day ${formatNumber(stockLedger.nextRefreshColonyDay)}`}</strong></div>
                <div><span>Buildings checked</span><strong>{formatNumber(stockLedger.scannedBuildings)}</strong></div>
              </div>
              <label className="stock-search"><span>Search items</span><input type="search" value={stockQuery} onChange={(event) => onStockQueryChange(event.target.value)} placeholder="Search items or registry IDs…" /></label>
              {stockCoverageChanged && <p className="coverage-warning"><strong>This count may be incomplete.</strong> Storage coverage changed since the last report. Check again after the next count.</p>}
              {stockLedger.startupScan && <p className="capability-note"><strong>First count after startup.</strong> Quantities will be checked again shortly.</p>}
              <InventoryList model={model} />
              <p className="stock-note">Counted every {stockLedger.refreshIntervalDays} colony days. {stockLedger.truncated ? "The true total may be higher." : `${formatNumber(stockLedger.scannedBuildings)} buildings checked.`} {stockLedger.omittedItemTypes > 0 ? `${formatNumber(stockLedger.omittedItemTypes)} uncommon item types are not shown.` : ""}</p>
            </> : <p className="empty-state">Storage count unavailable.</p>}
          </section>

          <section className="side-section panel-span" aria-labelledby="recent-output-heading">
            <h2 id="recent-output-heading">Recent production</h2>
            {recentStatistics && visibleRecentKeys.length > 0 ? <div className="production-grid">{visibleRecentKeys.map((key) => <div key={key}><span>{statLabels[key] ?? identifierName(key)}</span><strong>{formatNumber(recentStatistics.today[key] ?? 0)} <small>today</small></strong><b>{formatNumber(recentStatistics.recentWindow[key] ?? 0)} over {recentStatistics.windowDays} days</b></div>)}</div>
              : <p className="empty-state">No recent production recorded.</p>}
            {mealWindowDifference !== 0 && <p className="method-note">Food and production records differ by {formatNumber(Math.abs(mealWindowDifference))} meals because their count periods end at different times.</p>}
          </section>

          <section className="side-section" aria-labelledby="output-heading">
            <h2 id="output-heading">Lifetime production</h2>
            {visibleStats.length === 0 && <p className="empty-state">No lifetime production recorded.</p>}
            <div className="stat-grid">
              {visibleStats.map((key) => <div key={key}><strong>{formatNumber(snapshot.statistics[key])}</strong><span>{statLabels[key] ?? identifierName(key)}</span></div>)}
            </div>
          </section>

          <section className="side-section note" aria-label="Report diagnostics">
            <details className="section-disclosure"><summary>Developer details</summary>
            <dl className="facts compact">
              <div><dt>Bridge</dt><dd>{snapshot.bridgeVersion}</dd></div>
              <div><dt>Source</dt><dd>Local report</dd></div>
              <div><dt>Schema</dt><dd>{snapshot.schemaVersion}</dd></div>
              <div><dt>Trigger</dt><dd>{identifierName(snapshot.trigger)}</dd></div>
              <div><dt>Coverage</dt><dd>{availableCapabilities} / {totalCapabilities}</dd></div>
              <div><dt>Warnings</dt><dd>{snapshot.warnings.length}</dd></div>
              <div><dt>Errors</dt><dd>{snapshot.errors.length}</dd></div>
              <div><dt>Created</dt><dd>{formatSnapshotTime(snapshot.generatedAt)}</dd></div>
              <div><dt>Read</dt><dd>{receivedAt ? formatSnapshotTime(receivedAt) : "Not reported"}</dd></div>
              <div><dt>Seen</dt><dd>{observedAt ? formatSnapshotTime(observedAt) : "Not yet"}</dd></div>
            </dl>
            <div className="capability-list">
              {unsupportedCapabilities.map((name) => <p key={name}><strong>{identifierName(name)}:</strong> Not included in this colony report.</p>)}
            </div>
            </details>
          </section>
        </div>
      </div>
  );
});


