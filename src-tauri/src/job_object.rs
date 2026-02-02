use std::sync::OnceLock;
use win32job::Job;

static JOB: OnceLock<Job> = OnceLock::new();

pub fn init_job_object() -> Result<(), String> {
    JOB.get_or_try_init(|| {
        let job = Job::create().map_err(|e| format!("Failed to create job object: {}", e))?;

        let mut info = job
            .query_extended_limit_info()
            .map_err(|e| format!("Failed to query job info: {}", e))?;

        info.limit_kill_on_job_close();

        job.set_extended_limit_info(&mut info)
            .map_err(|e| format!("Failed to set job info: {}", e))?;

        job.assign_current_process()
            .map_err(|e| format!("Failed to assign current process to job: {}", e))?;

        tracing::info!("Job object initialized - child processes will terminate on launcher exit");
        Ok(job)
    })?;

    Ok(())
}
