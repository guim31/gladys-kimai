// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The text
// fields are strings, so a scene variable fits too.
//
//   - `start_timer`: start a timer on a project and an activity (a button on
//     the desk, the arrival at the office), the running one stopped first if
//     the option is ticked;
//   - `stop_timer`: stop the running timer (leaving the office, the computer
//     going to sleep);
//   - `toggle_timer`: stop when a timer runs, otherwise start the project and
//     activity given, or resume the last entry (one button for both).
// -----------------------------------------------------------------------------

const stoppedOutputs = ({ stopped }) => {
  const first = stopped[0];
  return {
    stopped: stopped.length,
    duration_minutes: first ? first.minutes : 0,
    project_name: first ? first.projectName : '',
    activity_name: first ? first.activityName : '',
  };
};

export const SCENE_ACTIONS = {
  async start_timer(hub, { fields = {} }) {
    const { entry, projectName, activityName } = await hub.startTimer({
      project: fields.project,
      activity: fields.activity,
      description: fields.description,
      stopRunning: fields.stop_running === true || fields.stop_running === 'true',
    });
    return { timesheet_id: entry.id, project_name: projectName, activity_name: activityName };
  },

  async stop_timer(hub) {
    return stoppedOutputs(await hub.stopTimers());
  },

  async toggle_timer(hub, { fields = {} }) {
    const result = await hub.toggle({
      project: fields.project,
      activity: fields.activity,
      description: fields.description,
    });
    if (!result.running) {
      return { running: false, ...stoppedOutputs(result) };
    }
    return {
      running: true,
      duration_minutes: 0,
      project_name: result.started.projectName,
      activity_name: result.started.activityName,
    };
  },
};
