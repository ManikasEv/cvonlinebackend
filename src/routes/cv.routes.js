import express from 'express';
import sql from '../config/database.js';
import { getAuth } from '@clerk/express';
import { getUserByClerkId } from '../models/database.models.js';

const router = express.Router();

/**
 * GET /api/cvs
 * Get all CVs for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cvs = await sql`
      SELECT * FROM cvs 
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
    `;

    res.status(200).json({ cvs });
  } catch (error) {
    console.error('Error getting CVs:', error);
    res.status(500).json({ error: 'Failed to get CVs' });
  }
});

/**
 * GET /api/cvs/:id
 * Get a specific CV by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    const cvId = req.params.id;

    const cv = await sql`
      SELECT * FROM cvs 
      WHERE id = ${cvId} AND user_id = ${user.id}
    `;

    if (cv.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    res.status(200).json({ cv: cv[0] });
  } catch (error) {
    console.error('Error getting CV:', error);
    res.status(500).json({ error: 'Failed to get CV' });
  }
});

/**
 * POST /api/cvs
 * Create a new CV
 */
router.post('/', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    const { title, templateType, personalInfo, education, experience, skills, languages, certifications, projects } = req.body;

    const newCV = await sql`
      INSERT INTO cvs (user_id, title, template_type, personal_info, education, experience, skills, languages, certifications, projects)
      VALUES (
        ${user.id}, 
        ${title}, 
        ${templateType || 'basic'}, 
        ${JSON.stringify(personalInfo || {})},
        ${JSON.stringify(education || [])},
        ${JSON.stringify(experience || [])},
        ${JSON.stringify(skills || [])},
        ${JSON.stringify(languages || [])},
        ${JSON.stringify(certifications || [])},
        ${JSON.stringify(projects || [])}
      )
      RETURNING *
    `;

    res.status(201).json({ 
      message: 'CV created successfully', 
      cv: newCV[0] 
    });
  } catch (error) {
    console.error('Error creating CV:', error);
    res.status(500).json({ error: 'Failed to create CV' });
  }
});

/**
 * PUT /api/cvs/:id
 * Update an existing CV
 */
router.put('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    const cvId = req.params.id;
    const { title, templateType, personalInfo, education, experience, skills, languages, certifications, projects } = req.body;

    const updatedCV = await sql`
      UPDATE cvs 
      SET 
        title = ${title},
        template_type = ${templateType},
        personal_info = ${JSON.stringify(personalInfo)},
        education = ${JSON.stringify(education)},
        experience = ${JSON.stringify(experience)},
        skills = ${JSON.stringify(skills)},
        languages = ${JSON.stringify(languages)},
        certifications = ${JSON.stringify(certifications)},
        projects = ${JSON.stringify(projects)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${cvId} AND user_id = ${user.id}
      RETURNING *
    `;

    if (updatedCV.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    res.status(200).json({ 
      message: 'CV updated successfully', 
      cv: updatedCV[0] 
    });
  } catch (error) {
    console.error('Error updating CV:', error);
    res.status(500).json({ error: 'Failed to update CV' });
  }
});

/**
 * DELETE /api/cvs/:id
 * Delete a CV
 */
router.delete('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    const cvId = req.params.id;

    const result = await sql`
      DELETE FROM cvs 
      WHERE id = ${cvId} AND user_id = ${user.id}
      RETURNING id
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    res.status(200).json({ message: 'CV deleted successfully' });
  } catch (error) {
    console.error('Error deleting CV:', error);
    res.status(500).json({ error: 'Failed to delete CV' });
  }
});

export default router;
