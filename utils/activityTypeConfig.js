const activityTypeConfig = {
  running: { allowed: ["distance", "elevationGain", "avgSpeed", "duration"] },
  cycling: { allowed: ["distance", "elevationGain", "avgSpeed", "duration"] },
  walking: { allowed: ["distance", "duration"] },
  swimming: { allowed: ["distance", "poolLength", "laps", "duration"] },
  workout: { allowed: ["exercises", "duration"] },
};

module.exports = activityTypeConfig;
