import type {
	AdminExternalDataSnapshotDetail,
	AdminExternalDataSnapshotListItem,
	AdminExternalDataSource,
	ExternalDataSnapshotStatus,
} from '../types/api';
import type { ExternalDataSnapshotRow, ExternalDataSourceRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

export function toAdminExternalDataSource(row: ExternalDataSourceRow): AdminExternalDataSource {
	return {
		id: row.id,
		type: row.type,
		provider: row.provider,
		name: row.name,
		isActive: row.is_active === 1,
		publishToGithub: row.publish_to_github === 1,
		githubFilePath: row.github_file_path,
		latestSnapshotId: row.latest_snapshot_id,
		latestDataHash: row.latest_data_hash,
		latestUpdatedAt: row.latest_updated_at ? toISOTimestamp(row.latest_updated_at) : null,
		latestPublishedCommitSha: row.latest_published_commit_sha,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

export function toAdminExternalDataSnapshotListItem(row: ExternalDataSnapshotRow): AdminExternalDataSnapshotListItem {
	return {
		id: row.id,
		sourceId: row.source_id,
		status: row.status as ExternalDataSnapshotStatus,
		fetchedAt: toISOTimestamp(row.fetched_at),
		dataHash: row.data_hash,
		errorMessage: row.error_message,
		publishedCommitSha: row.published_commit_sha,
		createdAt: toISOTimestamp(row.created_at),
	};
}

export function toAdminExternalDataSnapshotDetail(row: ExternalDataSnapshotRow): AdminExternalDataSnapshotDetail {
	return {
		...toAdminExternalDataSnapshotListItem(row),
		normalizedJson: row.normalized_json,
		rawR2Key: row.raw_r2_key,
	};
}
