import moment from 'moment';

const performanceTracker = (() => {
  // Simple stateless tracker using a global timestamp map for correlation
  return {
    log: (functionName, type, id = null, startTime = null) => {
      try {
        // Validate required parameters
        if (!functionName || typeof functionName !== 'string') {
          console.warn('Performance tracker: Missing or invalid function name');
          return null;
        }

        if (!type || (type !== 'start' && type !== 'end')) {
          console.warn('Performance tracker: Type must be "start" or "end"');
          return null;
        }

        const now = moment();
        const timestamp = now.format('YYYY-MM-DD HH:mm:ss.SSS');

        if (type === 'start') {
          const uniqueId = `${functionName}-${now.valueOf()}-${Math.floor(
            Math.random() * 10000,
          )}`;
          const idLabel = `[ID: ${id || uniqueId}]`.padEnd(45); // Align to fixed width (e.g., 45 chars)

          console.log(`[${timestamp}] ⏱️ START: ${functionName} ${idLabel}`);
          return { id: uniqueId, time: now.toISOString() };
        }

        if (type === 'end') {
          // Check if required parameters for end logging are present
          if (!id) {
            console.warn('Performance tracker: Missing ID for end log');
            return null;
          }

          let duration = 'unknown';
          if (startTime) {
            try {
              // Validate startTime format
              if (moment(startTime).isValid()) {
                duration = `${moment().diff(moment(startTime))}ms`;
              } else {
                duration = 'invalid time format';
              }
            } catch (timeError) {
              duration = 'time calculation error';
            }
          }

          const idLabel = `[ID: ${id}]`.padEnd(45);
          console.log(
            `[${timestamp}] ✅ END:   ${functionName} ${idLabel}- Duration: ${duration}`,
          );

          return null;
        }
      } catch (error) {
        console.warn(`Performance tracker error: ${error.message}`);
        return null;
      }
    },
  };
})();

export default performanceTracker;
